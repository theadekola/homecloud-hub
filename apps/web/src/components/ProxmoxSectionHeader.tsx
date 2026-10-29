import {createContext,useContext,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
export const ProxmoxHeaderContext=createContext<HTMLElement|null|undefined>(undefined);
export default function ProxmoxSectionHeader({title,description,actions}:{title:ReactNode;description:string;actions:ReactNode}){
 const target=useContext(ProxmoxHeaderContext);
 if(target!==undefined)return target?createPortal(actions,target):null;
 return <div className="vm-title"><div><h2>{title}</h2><p>{description}</p></div><div>{actions}</div></div>;
}
