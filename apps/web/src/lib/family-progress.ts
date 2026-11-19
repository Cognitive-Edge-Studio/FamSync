import {dayInZone,shiftDay} from './calendar-date';
import type {Goal} from './goals';
import type {Task} from './tasks';

export const progressCategories = [
  {category:'Education & Learning',label:'Learning'},
  {category:'Sports & Fitness',label:'Fitness'},
  {category:'Financial & Savings',label:'Savings'},
  {category:'Home & Household',label:'Home'},
  {category:'Hobbies & Creativity',label:'Creativity'},
  {category:'Health & Wellness',label:'Wellbeing'},
  {category:'Family & Relationships',label:'Family'},
  {category:'Personal Development',label:'Development'},
] as const;

export function familyProgress(goals:Goal[],tasks:Task[],memberId:string,today:string,timeZone:string) {
  const selectedGoals=goals.filter(goal=>!goal.archived&&(memberId==='all'||goal.type==='individual'&&goal.assignee?.userId===memberId));
  const selectedTasks=tasks.filter(task=>!task.archived&&(memberId==='all'||task.assignee?.userId===memberId));
  const categories=progressCategories.map(axis=>{
    const included=selectedGoals.filter(goal=>goal.category===axis.category);
    const measured=included.flatMap(goal=>goal.status==='completed'?[100]:goal.percentage===null?[]:[Math.max(0,Math.min(100,goal.percentage))]);
    return {...axis,count:included.length,value:measured.length?Math.round(measured.reduce((sum,value)=>sum+value,0)/measured.length):null};
  });
  const weekStart=shiftDay(today,-6);
  return {categories,goalCount:selectedGoals.length,
    active:selectedTasks.filter(task=>task.status!=='completed').length,
    overdue:selectedTasks.filter(task=>task.status!=='completed'&&task.overdue).length,
    completedThisWeek:selectedTasks.filter(task=>{
      if(task.status!=='completed'||!task.completedAt)return false;
      const day=dayInZone(new Date(task.completedAt),timeZone);
      return day>=weekStart&&day<=today;
    }).length,
  };
}
