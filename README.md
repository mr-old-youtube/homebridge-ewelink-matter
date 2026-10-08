<p align="center">
   <img alt="Homebridge eWeLink Matter" src="https://raw.githubusercontent.com/homebridge-plugins/homebridge-ewelink/latest/branding/Homebridge_x_eWeLink.png" width="600px">
</p>
<span align="center">

## homebridge-ewelink-matter

Matter-native Homebridge plugin to integrate eWeLink & Sonoff devices into HomeKit and Matter with real-time electrical energy monitoring.

</span>

### Plugin Information

- This plugin allows you to view and control your eWeLink devices within HomeKit and Matter. The plugin:
  - **Matter-Native Support**: Exposes energy-monitoring outlets (such as Sonoff S31, S40, S41, POW, POW Elite, DUALR3, SPM) as native Matter `OnOffOutlet` accessories on Homebridge >= 2.3.0.
  - **Real-Time Energy Monitoring**: Exposes Matter `ElectricalPowerMeasurement` (Watts, Volts, Amps) and `ElectricalEnergyMeasurement` (kWh, periodic energy deltas) directly to Apple Home (iOS 18+), Google Home, and Home Assistant.
  - **Multi-Channel Outlets**: Automatically separates multi-gang power devices (like DUALR3) into individual Matter accessories per channel.
  - requires your eWeLink credentials to download a device list
  - attempts to control your supported devices locally, reverting to cloud control if necessary
  - listens for real-time device updates when controlled externally
  - keeps standard non-power accessories on Apple HomeKit (HAP) so your Matter fabric stays clean.

### Prerequisites

- To use this plugin, you will need to already have:
  - [Node](https://nodejs.org): latest version of `v22`, `v24` or `v26` - any other major version is not supported.
  - [Homebridge](https://homebridge.io): `v1.6` or above - refer to link for more information and installation instructions.

### Setup

- [Installation](https://github.com/homebridge-plugins/homebridge-ewelink/wiki/Installation)
- [Configuration](https://github.com/homebridge-plugins/homebridge-ewelink/wiki/Configuration)
- [Beta Version](https://github.com/homebridge-plugins/homebridge-ewelink/wiki/Beta-Version)
- [Node Version](https://github.com/homebridge-plugins/homebridge-ewelink/wiki/Node-Version)

### Features

- [Supported Devices](https://github.com/homebridge-plugins/homebridge-ewelink/wiki/Supported-Devices)
- [Accessory Simulations](https://github.com/homebridge-plugins/homebridge-ewelink/wiki/Accessory-Simulations)
- [Connection Methods](https://github.com/homebridge-plugins/homebridge-ewelink/wiki/Connection-Methods)
- [Internal API](https://github.com/homebridge-plugins/homebridge-ewelink/wiki/Internal-API)

### Help/About

- [Common Errors](https://github.com/homebridge-plugins/homebridge-ewelink/wiki/Common-Errors)
- [Support Request](https://github.com/homebridge-plugins/homebridge-ewelink/issues/new/choose)
- [Changelog](https://github.com/homebridge-plugins/homebridge-ewelink/blob/latest/CHANGELOG.md)
- [About Me](https://github.com/sponsors/bwp91)

### Credits

- To the original plugin maintainer: [@gbro115](https://github.com/gbro115).
- To successive contributors: [@MrTomAsh](https://github.com/MrTomAsh) and [@howanghk](https://github.com/howanghk) for [homebridge-ewelink-max](https://github.com/howanghk/homebridge-ewelink).
- To the creators/contributors of [Homebridge](https://homebridge.io) who make this plugin possible.
- To the creators/contributors of [Fakegato](https://github.com/simont77/fakegato-history): [@simont77](https://github.com/simont77) and [@NorthernMan54](https://github.com/NorthernMan54).
- To the creator of the awesome plugin header logo: [Keryan Belahcene](https://www.instagram.com/keryan.me).
- To all users who have shared their devices to enable functionality.

### Disclaimer

- I am in no way affiliated with eWeLink nor any of the device brands (like Sonoff) and this plugin is a personal project that I maintain in my free time.
- Use this plugin entirely at your own risk - please see licence for more information.
