export default function TemperatureReadingDetails({reading}:{reading:any}){
 return <details><summary>Sensor source &amp; validation</summary><div className="muted" style={{overflowWrap:'anywhere'}}>
 <p>Source: {reading.source||'Not reported; update the connector for source details.'}</p>
 <p>Label: {reading.label||'Unlabelled sensor; component identity is not verified.'}</p>
 <p>Raw input: {typeof reading.rawMilliCelsius==='number'?`${reading.rawMilliCelsius} millidegrees Celsius`:'Not reported'}</p>
 <p>Driver fault: {reading.fault===true?'Fault reported; excluded from temperature maximum.':reading.fault===false?'No fault reported.':'Not reported; this does not verify sensor accuracy.'}</p>
 {typeof reading.maxCelsius==='number'&&<p>Driver maximum: {reading.maxCelsius} °C</p>}{typeof reading.criticalCelsius==='number'&&<p>Driver critical threshold: {reading.criticalCelsius} °C</p>}
 <p>A reported value is not independent proof of physical temperature. Verify unusual readings against BIOS/manufacturer diagnostics.</p>
 </div></details>;
}
