// Share one lock across nested dialogs and the mobile navigation drawer.
const locks=new WeakMap<HTMLElement,{count:number;release:()=>void}>();
export function lockPageScroll(){
 let released=false;
 const body=document.body,existing=locks.get(body);
 if(existing){existing.count++;return unlock}
 const x=window.scrollX,y=window.scrollY;
 const properties=['overflow','position','top','left','right','width'] as const;
 const previous=properties.map(name=>[name,body.style.getPropertyValue(name),body.style.getPropertyPriority(name)]);
 body.style.overflow='hidden';body.style.position='fixed';body.style.top=`${-y}px`;body.style.left='0';body.style.right='0';body.style.width='100%';
 locks.set(body,{count:1,release:()=>{for(const [name,value,priority] of previous){if(value)body.style.setProperty(name,value,priority);else body.style.removeProperty(name)}if(window.scrollX!==x||window.scrollY!==y)window.scrollTo(x,y)}});
 return unlock;
 function unlock(){if(released)return;released=true;const active=locks.get(body);if(!active)return;if(--active.count===0){locks.delete(body);active.release()}}
}
