import {brandAssets} from './brand-assets';
const osAliases:Record<string,string>={ubuntu:'ubuntu',debian:'debian',alpine:'alpinelinux',alpinelinux:'alpinelinux',arch:'archlinux',archlinux:'archlinux',fedora:'fedora',rhel:'redhat',redhat:'redhat',centos:'centos',rocky:'rockylinux',rockylinux:'rockylinux',alma:'almalinux',almalinux:'almalinux',opensuse:'opensuse','opensuse-leap':'opensuse','opensuse-tumbleweed':'opensuse',sles:'opensuse',suse:'opensuse',freebsd:'freebsd',openbsd:'openbsd',android:'android',darwin:'apple',macos:'apple',osx:'apple',mint:'linuxmint',linuxmint:'linuxmint',kali:'kalilinux',kalilinux:'kalilinux',raspbian:'raspberrypi',raspberrypios:'raspberrypi',nixos:'nixos',gentoo:'gentoo'};
// Use reported OS IDs and descriptions, never VM/container names or IP addresses.
export function operatingSystemIcon(...hints:unknown[]){
 const texts=hints.filter((h):h is string=>typeof h==='string').map(h=>h.trim().toLowerCase()).filter(Boolean);
 for(const text of texts){if(Object.hasOwn(osAliases,text))return osAliases[text];if(/^win(?:dows|\d|xp|2k)|^w(?:xp|2k|vista)$|microsoft windows/.test(text))return 'windows';for(const [pattern,id] of [[/\bubuntu\b/,'ubuntu'],[/\bdebian\b/,'debian'],[/\balpine\b/,'alpinelinux'],[/\barch(?: linux)?\b/,'archlinux'],[/\bfedora\b/,'fedora'],[/\bred hat\b|\brhel\b/,'redhat'],[/\bcentos\b/,'centos'],[/\brocky\b/,'rockylinux'],[/\balmalinux\b|\balma linux\b/,'almalinux'],[/\bopensuse\b|\bsuse\b/,'opensuse'],[/\bfreebsd\b/,'freebsd'],[/\bopenbsd\b/,'openbsd'],[/\bandroid\b/,'android'],[/\bmac\s?os\b|\bdarwin\b|\bos x\b/,'apple'],[/\blinux mint\b/,'linuxmint'],[/\bkali\b/,'kalilinux'],[/\braspberry pi\b|\braspbian\b/,'raspberrypi'],[/\bnixos\b/,'nixos'],[/\bgentoo\b/,'gentoo']] as [RegExp,string][])if(pattern.test(text))return id;}
 return texts.some(t=>t==='l26'||t==='l24'||/\blinux\b/.test(t))?'linux':null;
}
const serviceAliases:Record<string,string>={postgres:'postgresql',node:'nodedotjs',nodejs:'nodedotjs','node.js':'nodedotjs','home-assistant':'homeassistant',microsoftsqlserver:'mssql','mssql-server':'mssql',server:'',httpd:'apache','adguardhome':'adguard','uptime-kuma':'uptimekuma','traefik':'traefikproxy','pi-hole':'pihole','nginx-unprivileged':'nginx',mariadb:'mariadb'};
export function serviceIcon(value:unknown){
 if(typeof value!=='string')return null;
 const image=value.trim().toLowerCase().split('@')[0];if(!image)return null;
 if(/(?:^|\/)mssql\/server(?::|$)/.test(image))return 'mssql';
 const base=image.split('/').at(-1)!.split(':')[0],id=Object.hasOwn(serviceAliases,base)?serviceAliases[base]:base;
 return Object.hasOwn(brandAssets,id)?id:null;
}
