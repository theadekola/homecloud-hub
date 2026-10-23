import test from 'node:test';
import assert from 'node:assert/strict';
import {retireTemperature} from '../src/retired-temperature.js';
test('retires legacy temperature alerts and delivery records without claiming recovery or removing unrelated health',()=>{
 const heat={id:'heat',key:'operations:node:temperature:CPU',status:'active'},fault={id:'fault',key:'operations:node:sensor-fault:CPU',status:'resolved'},disk={id:'disk',key:'operations:node:disk:/dev/sda',status:'active'},provider={id:'provider',key:'truenas:heat',title:'Temperature',status:'active'};
 const state={alerts:[heat,fault,disk,provider],notificationQueue:[{alertId:'heat'},{alert:{key:fault.key}},{alertId:'disk'},{event:'test'}],headerObservations:{'alert:heat':'active','alert:disk':'active'},headerActivities:[{title:'Recovered: High hardware temperature'},{title:'Disk health failure',link:'/alerts?alert=disk'}]};
 retireTemperature(state);assert.deepEqual(state.alerts,[disk,provider]);assert.equal(state.notificationQueue.length,2);assert.equal(state.headerObservations['alert:heat'],undefined);assert.equal(state.headerObservations['alert:disk'],'active');assert.equal(state.headerActivities.length,1);
 const once=structuredClone(state);retireTemperature(state);assert.deepEqual(state,once);assert.deepEqual(retireTemperature({}),{});
});
