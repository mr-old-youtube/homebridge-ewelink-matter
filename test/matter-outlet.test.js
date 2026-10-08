import { describe, expect, it, vi } from 'vitest'
import MatterOutlet from '../lib/matter/matter-outlet.js'

describe('MatterOutlet', () => {
  function createMockPlatform(matterOverrides = {}) {
    const mockMatter = {
      deviceTypes: {
        OnOffOutlet: 0x010B,
      },
      clusterNames: {
        OnOff: 'onOff',
        ElectricalPowerMeasurement: 'electricalPowerMeasurement',
        ElectricalEnergyMeasurement: 'electricalEnergyMeasurement',
      },
      uuid: {
        generate: vi.fn(val => `uuid-${val}`),
      },
      updateAccessoryState: vi.fn().mockResolvedValue(true),
      ...matterOverrides,
    }

    return {
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
      api: {
        matter: mockMatter,
      },
      sendDeviceUpdate: vi.fn().mockResolvedValue(true),
    }
  }

  it('builds a Matter accessory with correct clusters for Sonoff S31 (UIID 32)', () => {
    const platform = createMockPlatform()
    const device = {
      deviceid: '1000123456',
      name: 'Sonoff S31 Plug',
      uiid: 32,
      brandName: 'SONOFF',
      extra: { model: 'S31' },
    }
    const accessory = {
      context: { eweUIID: 32 },
    }

    const outlet = new MatterOutlet(platform, device, accessory)
    const built = outlet.buildAccessory()

    expect(built.UUID).toBe('uuid-ewelink-matter:1000123456')
    expect(built.displayName).toBe('Sonoff S31 Plug')
    expect(built.deviceType).toBe(0x010B)
    expect(built.serialNumber).toBe('1000123456')
    expect(built.clusters.onOff).toBeDefined()
    expect(built.clusters.electricalPowerMeasurement).toBeDefined()
    expect(built.clusters.electricalEnergyMeasurement).toBeDefined()
  })

  it('correctly converts power (W -> mW), voltage (V -> mV), current (A -> mA) for S31', () => {
    const platform = createMockPlatform()
    const device = {
      deviceid: '1000123456',
      name: 'Sonoff S31',
      uiid: 32,
    }
    const accessory = {
      context: { eweUIID: 32 },
    }

    const outlet = new MatterOutlet(platform, device, accessory)
    outlet.applyState({
      switch: 'on',
      power: '12.50', // 12.50 W
      voltage: '120.0', // 120.0 V
      current: '0.104', // 0.104 A
    })

    const clusters = outlet.toClusters()
    expect(clusters.onOff.onOff).toBe(true)
    expect(clusters.electricalPowerMeasurement.activePower).toBe(12500) // 12.5 W = 12500 mW
    expect(clusters.electricalPowerMeasurement.voltage).toBe(120000) // 120 V = 120000 mV
    expect(clusters.electricalPowerMeasurement.activeCurrent).toBe(104) // 0.104 A = 104 mA
  })

  it('correctly applies divisor 100 for S40/S41/POW Elite (UIID 276)', () => {
    const platform = createMockPlatform()
    const device = {
      deviceid: '1000abcdef',
      name: 'Sonoff S41',
      uiid: 276,
    }
    const accessory = {
      context: { eweUIID: 276 },
    }

    const outlet = new MatterOutlet(platform, device, accessory)
    outlet.applyState({
      switches: [{ outlet: 0, switch: 'on' }],
      power: '2500', // 25.00 W reported as 2500 with divisor 100
      voltage: '22050', // 220.50 V
      current: '113', // 1.13 A
    })

    const clusters = outlet.toClusters()
    expect(clusters.onOff.onOff).toBe(true)
    expect(clusters.electricalPowerMeasurement.activePower).toBe(25000) // 25 W = 25000 mW
    expect(clusters.electricalPowerMeasurement.voltage).toBe(220500) // 220.5 V = 220500 mV
    expect(clusters.electricalPowerMeasurement.activeCurrent).toBe(1130) // 1.13 A = 1130 mA
  })

  it('handles energy measurement accumulation', () => {
    const platform = createMockPlatform()
    const device = {
      deviceid: '1000999999',
      name: 'POW Origin',
      uiid: 190,
    }
    const accessory = {
      context: { eweUIID: 190 },
    }

    const outlet = new MatterOutlet(platform, device, accessory)
    outlet.applyState({
      kwh: '1.25', // 1.25 kWh
    })

    const clusters = outlet.toClusters()
    // 1.25 kWh = 1,250,000 mWh
    expect(clusters.electricalEnergyMeasurement.cumulativeEnergyImported).toEqual({
      energy: 1250000,
    })
  })

  it('correctly manages multi-channel devices (e.g. DUALR3 with 2 channels)', () => {
    const platform = createMockPlatform()
    const device = {
      deviceid: '1000dualr3',
      name: 'Living Room Switch',
      uiid: 126,
    }
    const accessory = {
      context: { eweUIID: 126 },
    }

    const outletCh1 = new MatterOutlet(platform, device, accessory, 0, 2)
    const outletCh2 = new MatterOutlet(platform, device, accessory, 1, 2)

    const built1 = outletCh1.buildAccessory()
    const built2 = outletCh2.buildAccessory()

    expect(built1.displayName).toBe('Living Room Switch CH1')
    expect(built2.displayName).toBe('Living Room Switch CH2')
    expect(built1.UUID).toBe('uuid-ewelink-matter:1000dualr3:1')
    expect(built2.UUID).toBe('uuid-ewelink-matter:1000dualr3:2')

    // Simulate multi-channel status update from eWeLink
    const payload = {
      switches: [
        { outlet: 0, switch: 'on' },
        { outlet: 1, switch: 'off' },
      ],
      actPow_00: '1500', // 15.00 W (divisor 100)
      actPow_01: '4500', // 45.00 W (divisor 100)
      voltage_00: '22000', // 220.00 V
      voltage_01: '22000',
      current_00: '68', // 0.68 A
      current_01: '204', // 2.04 A
    }

    outletCh1.applyState(payload)
    outletCh2.applyState(payload)

    const ch1Clusters = outletCh1.toClusters()
    const ch2Clusters = outletCh2.toClusters()

    expect(ch1Clusters.onOff.onOff).toBe(true)
    expect(ch1Clusters.electricalPowerMeasurement.activePower).toBe(15000) // 15 W = 15000 mW
    expect(ch1Clusters.electricalPowerMeasurement.activeCurrent).toBe(680) // 0.68 A = 680 mA

    expect(ch2Clusters.onOff.onOff).toBe(false)
    expect(ch2Clusters.electricalPowerMeasurement.activePower).toBe(45000) // 45 W = 45000 mW
    expect(ch2Clusters.electricalPowerMeasurement.activeCurrent).toBe(2040) // 2.04 A = 2040 mA
  })
})
