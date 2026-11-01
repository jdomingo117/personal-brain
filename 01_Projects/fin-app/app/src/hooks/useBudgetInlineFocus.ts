import {useLayoutEffect,useRef} from 'react'

/** Inline previews replace their trigger; retain keyboard position through that replacement. */
export function useBudgetInlineFocus(open:boolean){
 const region=useRef<HTMLElement>(null),wasOpen=useRef(false)
 useLayoutEffect(()=>{
  if(open){
   const target=region.current?.querySelector<HTMLElement>('form h4, form')
   if(target){target.tabIndex=-1;target.focus()}
  }else if(wasOpen.current)region.current?.querySelector<HTMLButtonElement>('button')?.focus()
  wasOpen.current=open
 },[open])
 return region
}
