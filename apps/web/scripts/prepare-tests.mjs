import {mkdirSync} from 'node:fs';
mkdirSync(new URL('../node_modules/',import.meta.url),{recursive:true});
