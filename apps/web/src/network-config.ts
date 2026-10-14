// Compare configuration only; traffic, availability and sampling metadata are not edits.
export const networkConfigKeys=['type','cidr','cidr6','gateway','gateway6','mtu','autostart','bridge_ports','bridge_vlan_aware','slaves','bond_mode','vlan-id','vlan-raw-device','comments'];
export function networkConfig(row:any){return Object.fromEntries(networkConfigKeys.map(key=>[key,String(row?.[key]??'')]));}
export function sameNetworkConfig(a:any,b:any){return JSON.stringify(networkConfig(a))===JSON.stringify(networkConfig(b));}
