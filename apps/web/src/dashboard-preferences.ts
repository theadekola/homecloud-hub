export const dashboardWidgets=['resources','health','history','guests','actions','map','backups','assistant','services'];
export function loadDashboardWidgets(){try{const value=JSON.parse(localStorage.getItem('iclusters-widgets')||'null');return Array.isArray(value)?value.filter((w:string)=>dashboardWidgets.includes(w)):dashboardWidgets;}catch{return dashboardWidgets;}}
export function saveDashboardWidgets(value:string[]){localStorage.setItem('iclusters-widgets',JSON.stringify(value.filter(w=>dashboardWidgets.includes(w))));window.dispatchEvent(new Event('iclusters-widgets'));}
