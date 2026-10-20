// Upgrade only historical defaults; installation-specific names are preserved.
export function upgradeBrandSettings(settings){
 if(!settings||!['HomeCloud','HomeCloud Hub'].includes(settings.siteName))return;
 settings.siteName='i-Clusters';
 if(settings.description==='Homelab management')settings.description='Your infrastructure, connected.';
}
