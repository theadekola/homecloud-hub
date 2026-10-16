import {useState} from 'react';
import {getIdleMinutes,setIdleMinutes,idleOptions} from '../session';
export default function SessionPreferences(){
 const [minutes,setMinutes]=useState(getIdleMinutes),[message,setMessage]=useState('');
 return <div className="session-preferences"><label htmlFor="idle-sign-out">Auto sign out after inactivity</label><select id="idle-sign-out" value={minutes} onChange={e=>{const value=Number(e.target.value);setIdleMinutes(value);setMinutes(value);setMessage('Automatic sign-out time saved for this browser.');}}>{idleOptions.map(value=><option value={value} key={value}>{value<60?`${value} minutes`:`${value/60} ${value===60?'hour':'hours'}`}</option>)}</select><small className="settings-note">Applies to this browser, including remembered sign-ins. Typing, taps and scrolling keep the session active. Background refreshes do not. This signs out the interface; existing server jobs continue.</small>{message&&<p role="status">{message}</p>}</div>;
}
