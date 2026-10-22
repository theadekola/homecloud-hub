import type {ButtonHTMLAttributes,ComponentProps,ReactNode} from 'react';

const controls='button,a,input,select,textarea,label,summary,[role="button"],[role="checkbox"],[contenteditable="true"]';

/** Inspect from a row's cells without activating when a nested control is used. */
export function InspectableRow({onInspect,className='',children,...props}:Omit<ComponentProps<'tr'>,'onClick'|'onKeyDown'> & {onInspect:(row:HTMLTableRowElement)=>void}){
 return <tr {...props} tabIndex={0} className={`inspectable-row ${className}`}
  onClick={event=>{if(!event.defaultPrevented&&!(event.target as HTMLElement).closest?.(controls)&&!window.getSelection()?.toString())onInspect(event.currentTarget)}}
  onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onInspect(event.currentTarget)}}}
 >{children}</tr>;
}

export function TableAction({label,children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement> & {label:string;children:ReactNode}){
 return <button {...props} type={props.type||'button'} className={`btn secondary table-action ${className}`} aria-label={label} title={props.title||label}>{children}</button>;
}
