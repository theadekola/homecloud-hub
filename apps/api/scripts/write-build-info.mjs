import fs from 'node:fs';
import {createBuildInfo} from '../src/build-info.js';
const info=createBuildInfo({date:process.env.HOMECLOUD_BUILD_DATE||new Date().toISOString(),revision:process.env.HOMECLOUD_BUILD_REVISION||'',number:process.env.HOMECLOUD_BUILD_NUMBER||''});
fs.writeFileSync(new URL('../src/build-info.json',import.meta.url),JSON.stringify(info,null,2)+'\n');
console.log(`HomeCloud ${info.version} build ${info.buildNumber} (${info.buildDate})`);
