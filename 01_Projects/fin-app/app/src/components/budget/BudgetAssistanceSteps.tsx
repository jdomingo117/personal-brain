export const assistanceSteps=[
  {part:1,label:'Check history',icon:'M3 11a8 8 0 1 1 2 5.3M3 6v5h5M11 7v4l3 2'},
  {part:2,label:'Check amounts',icon:'M3 6h6m4 0h6M3 11h10m4 0h2M3 16h2m4 0h10M9 4v4m4 1v4m-8 1v4'},
  {part:3,label:'Review draft',icon:'M6 3h7l4 4v12H6zM13 3v4h4M9 13l2 2 3-4'},
] as const

export function AssistanceStepIcon({path}:{path:string}) {
  return <svg aria-hidden="true" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={path}/></svg>
}
