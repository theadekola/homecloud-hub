// Embedded browsers may report non-BCP-47 OS locale strings such as en-US@posix.
export function safeLocale(value:string|undefined){try{return value?Intl.getCanonicalLocales(value)[0]:undefined;}catch{return undefined;}}
