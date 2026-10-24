import {RefreshCw} from 'lucide-react';
import type {ReactNode} from 'react';
import {reportValue as readingValue,reportPending,summaryValue} from '../report-value';
export default function ReportLoading({message,label='Report pending',inline=false}:{message?:string;label?:string;inline?:boolean}){
 return <span className={`report-loading${inline?' inline':''}`} role="status" aria-label={label}><RefreshCw className="report-loading-circle" aria-hidden="true"/>{message&&<span className="report-loading-message">{message}</span>}</span>;
}
export function reportValue<T>(value:T,reading:{loading?:boolean;error?:string;data?:any}):ReactNode{
 const result=readingValue(value,reading);return typeof result==='string'&&(/^Loading(?:\.\.\.|…)?$/.test(result)||['Not reported','--','—'].includes(result)&&reportPending(reading))?<ReportLoading inline/>:result as ReactNode;
}

export function cardValue<T>(value:T,reading:{loading?:boolean;error?:string;data?:any}):ReactNode{
 return reportValue(summaryValue(value,reading),reading);
}
