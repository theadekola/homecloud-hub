import {useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useApi} from '../hooks';
import {pageTrail} from '../page-navigation';

function Trail({host}:{host?:string}){
 const location=useLocation(),session=useApi<any>('/auth/me',null),items=pageTrail(location.pathname,location.search,host,session.data?.user?.role);
 if(!items.length)return null;
 return <nav className="page-breadcrumbs" aria-label="Page path"><ol>{items.map((item,index)=><li key={`${index}:${item.label}`}>{index>0&&<span className="page-path-separator" aria-hidden="true">/</span>}{item.to?<Link to={item.to}>{item.label}</Link>:<span aria-current={index===items.length-1?'page':undefined}>{item.label}</span>}</li>)}</ol></nav>;
}
function DockerTrail(){
 const live=useApi<any>('/docker/hosts',{hosts:[]});
 const [selected,setSelected]=useState(()=>localStorage.getItem('iclusters_docker_host')||'');
 useEffect(()=>{const changed=()=>setSelected(localStorage.getItem('iclusters_docker_host')||'');window.addEventListener('iclusters-connection',changed);return()=>window.removeEventListener('iclusters-connection',changed)},[]);
 const host=live.data.hosts?.find((item:any)=>item.id===selected);
 return <Trail host={host?.name||host?.node||(selected?'Selected host':'Direct Engine')}/>;
}
export default function PageBreadcrumbs(){const location=useLocation();return location.pathname==='/docker'?<DockerTrail/>:<Trail/>;}
