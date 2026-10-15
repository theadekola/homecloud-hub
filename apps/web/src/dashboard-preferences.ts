export const dashboardWidgets=['resources','health','alerts','history','guests','actions','map','backups','assistant','services'];
export function loadDashboardWidgets(){try{const value=JSON.parse(localStorage.getItem('homecloud-widgets')||'null');return Array.isArray(value)?value.filter((w:string)=>dashboardWidgets.includes(w)):dashboardWidgets;}catch{return dashboardWidgets;}}
export function saveDashboardWidgets(value:string[]){localStorage.setItem('homecloud-widgets',JSON.stringify(value.filter(w=>dashboardWidgets.includes(w))));window.dispatchEvent(new Event('homecloud-widgets'));}
