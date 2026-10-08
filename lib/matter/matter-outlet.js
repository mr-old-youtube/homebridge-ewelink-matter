const ENERGY_UPDATE_INTERVAL_MS = 30000

export default class MatterOutlet {
  constructor(platform, device, accessory, channelIndex = 0, channelCount = 1) {
    this.platform = platform
    this.device = device
    this.accessory = accessory
    this.log = platform.log
    this.matter = platform.api.matter
    this.channelIndex = channelIndex
    this.channelCount = channelCount

    // Unique UUID per channel if device has multiple channels
    const idSuffix = this.channelCount > 1 ? `:${this.channelIndex + 1}` : ''
    this.uuid = this.matter.uuid.generate(`ewelink-matter:${device.deviceid}${idSuffix}`)
    this.registered = false
    this.syncTimer = undefined
    this.energySyncTimer = undefined
    this.lastPushedEnergy = undefined
    this.lastEnergyPushAt = 0
    this.energyBaseline = undefined
    this.pendingPeriodicEnergy = undefined

    // Cache internal state
    this.currentState = {
      on: false,
    }

    // Determine divisor based on UIID
    // UIID 190 (POW Origin/Elite), UIID 276 (S61STPF, S40/S41), UIID 7032, UIID 126 (DUALR3): divisor is 100
    // UIID 32 (S31, Pow R2), UIID 5 (Pow), UIID 182 (SPM): divisor is 1
    const uiid = device.uiid || accessory.context.eweUIID
    this.divisor = [126, 190, 276, 7032].includes(uiid) ? 100 : 1

    // Model name
    this.model = device.extra?.model || device.brandName || 'Smart Outlet'

    // Display Name with channel suffix if multi-channel
    this.displayName = this.channelCount > 1
      ? `${device.name} CH${this.channelIndex + 1}`
      : device.name
  }

  buildAccessory() {
    const handlers = {
      onOff: {
        on: async () => {
          this.log.debug('[%s] [Matter] Command: ON', this.displayName)
          await this.setOn(true)
        },
        off: async () => {
          this.log.debug('[%s] [Matter] Command: OFF', this.displayName)
          await this.setOn(false)
        },
        toggle: async () => {
          const next = !this.currentState.on
          this.log.debug('[%s] [Matter] Command: TOGGLE -> %s', this.displayName, next ? 'ON' : 'OFF')
          await this.setOn(next)
        },
      },
    }

    const serialSuffix = this.channelCount > 1 ? `-${this.channelIndex + 1}` : ''
    const serialNumber = (this.device.deviceid + serialSuffix).slice(0, 32)

    return {
      UUID: this.uuid,
      displayName: this.displayName,
      deviceType: this.matter.deviceTypes.OnOffOutlet,
      serialNumber,
      manufacturer: this.device.brandName || 'eWeLink / SONOFF',
      model: this.model,
      context: {
        deviceId: this.device.deviceid,
        channelIndex: this.channelIndex,
        channelCount: this.channelCount,
        kind: 'ewelink-matter-outlet',
      },
      clusters: this.toClusters(),
      handlers,
    }
  }

  async setOn(targetState) {
    try {
      const uiid = this.device.uiid || this.accessory.context.eweUIID
      const isSCM = [77, 78, 81, 107, 112, 138, 160, 191, 209, 264, 182, 190, 276, 7032].includes(uiid)
      const isMulti = this.channelCount > 1 || isSCM

      const targetValue = targetState ? 'on' : 'off'
      const params = isMulti
        ? { switches: [{ switch: targetValue, outlet: this.channelIndex }] }
        : { switch: targetValue }

      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.currentState.on = targetState
      await this.pushOnOff()
    } catch (err) {
      this.log.warn('[%s] [Matter] Failed to send on/off update: %s', this.displayName, err.message || err)
    }
  }

  markRegistered() {
    this.registered = true
    this.scheduleSync()
  }

  applyState(params) {
    let stateChanged = false

    // Switch state
    if (params.switches && params.switches[this.channelIndex]) {
      const chSwitch = params.switches[this.channelIndex].switch
      const isOn = chSwitch === 'on' || chSwitch === true
      if (this.currentState.on !== isOn) {
        this.currentState.on = isOn
        stateChanged = true
      }
    } else if (this.channelIndex === 0 && params.switch !== undefined) {
      const isOn = params.switch === 'on' || params.switch === true
      if (this.currentState.on !== isOn) {
        this.currentState.on = isOn
        stateChanged = true
      }
    }

    // Power measurements for this specific channel
    const chSuffix = `0${this.channelIndex}` // e.g. 00, 01 for DUALR3
    const rawPower = params[`actPow_${chSuffix}`]
      ?? params[`power_${chSuffix}`]
      ?? (this.channelIndex === 0 ? (params.power ?? params.actPow_ ?? params.phase_0_p) : undefined)

    const rawVoltage = params[`voltage_${chSuffix}`]
      ?? (params.voltage ?? params.phase_0_v) // Voltage is often shared across channels

    const rawCurrent = params[`current_${chSuffix}`]
      ?? (this.channelIndex === 0 ? (params.current ?? params.phase_0_c) : undefined)

    if (rawPower !== undefined) {
      const watts = Number.parseFloat(rawPower) / this.divisor
      const powerMw = Math.round(watts * 1000)
      if (this.currentState.powerMilliWatts !== powerMw) {
        this.currentState.powerMilliWatts = powerMw
        stateChanged = true
      }
    }

    if (rawVoltage !== undefined) {
      const volts = Number.parseFloat(rawVoltage) / this.divisor
      const voltageMv = Math.round(volts * 1000)
      if (this.currentState.voltageMilliVolts !== voltageMv) {
        this.currentState.voltageMilliVolts = voltageMv
        stateChanged = true
      }
    }

    if (rawCurrent !== undefined) {
      const amps = Number.parseFloat(rawCurrent) / this.divisor
      const currentMa = Math.round(amps * 1000)
      if (this.currentState.currentMilliAmps !== currentMa) {
        this.currentState.currentMilliAmps = currentMa
        stateChanged = true
      }
    }

    // Energy cumulative (mWh)
    const rawKwh = params[`kwh_${chSuffix}`]
      ?? (this.channelIndex === 0 ? params.kwh : undefined)

    if (rawKwh !== undefined || (this.channelIndex === 0 && this.accessory?.context?.energyReadingTotal !== undefined)) {
      const kwh = rawKwh !== undefined
        ? Number.parseFloat(rawKwh)
        : (this.accessory.context.energyReadingTotal || 0)
      const energyMwh = Math.round(kwh * 1000000)
      this.recordEnergySample(energyMwh)
      this.currentState.energyMilliWattHours = energyMwh
      stateChanged = true
    }

    if (stateChanged) {
      this.scheduleSync()
    }
  }

  recordEnergySample(energyMwh) {
    const timestamp = Math.floor(Date.now() / 1000)
    const previous = this.energyBaseline
    if (!previous) {
      this.energyBaseline = { energy: energyMwh, timestamp }
      return
    }

    if (energyMwh < previous.energy) {
      this.energyBaseline = { energy: energyMwh, timestamp }
      return
    }

    if (timestamp <= previous.timestamp) return

    const delta = energyMwh - previous.energy
    const pending = this.pendingPeriodicEnergy
    this.pendingPeriodicEnergy = pending
      ? {
        energy: pending.energy + delta,
        startTimestamp: pending.startTimestamp,
        endTimestamp: timestamp,
      }
      : {
        energy: delta,
        startTimestamp: previous.timestamp,
        endTimestamp: timestamp,
      }
    this.energyBaseline = { energy: energyMwh, timestamp }
  }

  toClusters() {
    return {
      onOff: {
        onOff: this.currentState.on ?? false,
      },
      electricalPowerMeasurement: this.toPowerCluster(),
      electricalEnergyMeasurement: this.toEnergyCluster(),
    }
  }

  toPowerCluster() {
    const cluster = {}
    if (this.currentState.powerMilliWatts !== undefined) cluster.activePower = this.currentState.powerMilliWatts
    if (this.currentState.voltageMilliVolts !== undefined) cluster.voltage = this.currentState.voltageMilliVolts
    if (this.currentState.currentMilliAmps !== undefined) cluster.activeCurrent = this.currentState.currentMilliAmps
    return cluster
  }

  toEnergyCluster() {
    return {
      cumulativeEnergyImported: this.currentState.energyMilliWattHours === undefined
        ? null
        : { energy: this.currentState.energyMilliWattHours },
      periodicEnergyImported: this.pendingPeriodicEnergy ?? null,
    }
  }

  scheduleSync() {
    if (this.syncTimer) return
    this.syncTimer = setTimeout(() => {
      this.syncTimer = undefined
      this.pushState()
    }, 100)
  }

  async pushState() {
    if (!this.registered || !this.matter?.updateAccessoryState) return

    await this.pushOnOff()

    const powerState = this.toPowerCluster()
    if (Object.keys(powerState).length > 0) {
      await this.tryPush(this.matter.clusterNames.ElectricalPowerMeasurement, powerState)
    }

    this.scheduleEnergyPush()
  }

  async pushOnOff() {
    if (!this.registered || this.currentState.on === undefined || !this.matter?.updateAccessoryState) return
    await this.tryPush(this.matter.clusterNames.OnOff, { onOff: this.currentState.on })
  }

  async tryPush(cluster, payload) {
    try {
      await this.matter.updateAccessoryState(this.uuid, cluster, payload)
      return true
    } catch (error) {
      this.log.debug('[%s] [Matter] Failed to push %s: %s', this.displayName, cluster, error.message || error)
      return false
    }
  }

  scheduleEnergyPush() {
    const energy = this.currentState.energyMilliWattHours
    if (energy === undefined || (energy === this.lastPushedEnergy && !this.pendingPeriodicEnergy) || this.energySyncTimer) return

    const remaining = ENERGY_UPDATE_INTERVAL_MS - (Date.now() - this.lastEnergyPushAt)
    if (remaining <= 0) {
      this.pushEnergy()
      return
    }

    this.energySyncTimer = setTimeout(() => {
      this.energySyncTimer = undefined
      this.pushEnergy()
    }, remaining)
  }

  async pushEnergy() {
    if (!this.registered || this.currentState.energyMilliWattHours === undefined) return

    const energy = this.currentState.energyMilliWattHours
    const periodic = this.pendingPeriodicEnergy
    const payload = {
      cumulativeEnergyImported: { energy },
    }
    if (periodic) payload.periodicEnergyImported = periodic

    const pushed = await this.tryPush(this.matter.clusterNames.ElectricalEnergyMeasurement, payload)
    if (pushed) {
      this.lastPushedEnergy = energy
      this.lastEnergyPushAt = Date.now()
      if (this.pendingPeriodicEnergy === periodic) {
        this.pendingPeriodicEnergy = undefined
      }
    }
  }

  dispose() {
    if (this.syncTimer) clearTimeout(this.syncTimer)
    if (this.energySyncTimer) clearTimeout(this.energySyncTimer)
    this.syncTimer = undefined
    this.energySyncTimer = undefined
    this.registered = false
  }
}
