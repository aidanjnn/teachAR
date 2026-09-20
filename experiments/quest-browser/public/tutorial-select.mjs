// Keep native value/change semantics for existing consumers; expose a keyboard-accessible custom picker.
export function enhanceSelects(root=document){
 for(const select of root.querySelectorAll('select')){
  if(select.dataset.enhanced)continue;select.dataset.enhanced='true';
  const wrap=document.createElement('span');wrap.className='trail-select';select.before(wrap);wrap.append(select);
  select.classList.add('select-source');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  const trigger=document.createElement('button'),list=document.createElement('div');trigger.type='button';trigger.className='select-trigger';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
  list.className='select-list';list.id=`${select.id}-options`;list.setAttribute('role','listbox');list.hidden=true;trigger.setAttribute('aria-controls',list.id);
  const label=select.getAttribute('aria-label')||select.closest('label')?.firstChild?.textContent?.trim()||select.id;
  trigger.setAttribute('aria-label',label);wrap.append(trigger,list);let cursor=0;
  const options=()=>Array.from(select.options);
  const refresh=()=>{trigger.textContent=(select.selectedOptions[0]?.textContent||'Choose')+' ⌄';trigger.disabled=select.disabled;};
  const close=()=>{list.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');};
  const paint=()=>{list.replaceChildren();options().forEach((option,i)=>{const row=document.createElement('div');row.id=`${list.id}-${i}`;row.setAttribute('role','option');row.setAttribute('aria-selected',String(option.selected));row.setAttribute('aria-disabled',String(option.disabled));row.textContent=option.textContent+(option.selected?' ✓':'');row.dataset.highlight=String(i===cursor);row.onmouseenter=()=>{if(cursor!==i){cursor=i;paint();}};row.onmousedown=e=>e.preventDefault();row.onclick=e=>{e.preventDefault();choose(i);};list.append(row);});trigger.setAttribute('aria-activedescendant',`${list.id}-${cursor}`);};
  const choose=i=>{if(options()[i]?.disabled)return;select.selectedIndex=i;select.dispatchEvent(new Event('change',{bubbles:true}));refresh();close();trigger.focus();};
  const open=()=>{cursor=Math.max(0,select.selectedIndex);list.hidden=false;trigger.setAttribute('aria-expanded','true');paint();};
  trigger.onclick=e=>{e.preventDefault();list.hidden?open():close();};
  trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key)){e.preventDefault();if(list.hidden){open();return;}if(e.key==='Enter'||e.key===' '){choose(cursor);return;}cursor=(cursor+(e.key==='ArrowDown'?1:-1)+options().length)%options().length;paint();}if(e.key==='Escape'||e.key==='Tab')close();};
  document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target))close();});
  select.addEventListener('change',refresh);select.addEventListener('ui-refresh',refresh);
  new MutationObserver(refresh).observe(select,{attributes:true,childList:true,subtree:true});refresh();
 }
}
