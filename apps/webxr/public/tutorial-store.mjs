// Local library plus current editor. Optimistic concurrency prevents stale-tab overwrite.
export class DraftConflict extends Error { constructor(){super('Another tab changed this tutorial. Download your work, then reload before editing.');this.name='DraftConflict';} }
function database(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('trail-tutorials',3);
    request.onupgradeneeded=()=>{
      const db=request.result;if(!db.objectStoreNames.contains('deleted'))db.createObjectStore('deleted');if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts');
      if(!db.objectStoreNames.contains('library'))db.createObjectStore('library',{keyPath:'id'});
      const read=request.transaction.objectStore('drafts').get('current');read.onsuccess=()=>{if(read.result?.id)request.transaction.objectStore('library').put(read.result);};
    };
    request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Local storage is blocked by another tab.'));
    request.onsuccess=()=>resolve(request.result);
  });
}
export const draftVersion=data=>data?{id:data.id??null,revision:data.revision??0}:null;
export async function saveTutorial(tutorial,expected){
  const db=await database();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['drafts','library','deleted'],'readwrite'),store=tx.objectStore('drafts');let failure;
      tx.oncomplete=resolve;tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error);
      const read=store.get('current');
      read.onsuccess=()=>{
        if(expected!==undefined&&JSON.stringify(draftVersion(read.result))!==JSON.stringify(expected)){failure=new DraftConflict();tx.abort();return;}
        const library=tx.objectStore('library');
        const existing=library.get(tutorial.id);
        existing.onsuccess=()=>{
          if(existing.result&&existing.result.revision>tutorial.revision){failure=new DraftConflict();tx.abort();return;}
          const tombstone=tx.objectStore('deleted').get(tutorial.id);tombstone.onsuccess=()=>{if(tombstone.result){failure=new DraftConflict();tx.abort();return;}store.put(tutorial,'current');library.put(tutorial);};
        };
      };
    });
  }finally{db.close();}
}
export async function loadTutorial(){
  const db=await database();
  try{return await new Promise((resolve,reject)=>{
    const request=db.transaction('drafts').objectStore('drafts').get('current');
    request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);
  });}finally{db.close();}
}

export async function listTutorials(){
  const db=await database();
  try{return await new Promise((resolve,reject)=>{const r=db.transaction('library').objectStore('library').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}
}
export async function findTutorial(id){
  const db=await database();
  try{return await new Promise((resolve,reject)=>{const r=db.transaction('library').objectStore('library').get(id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}finally{db.close();}
}

/** A tombstone prevents an old tab's queued autosave from resurrecting a deletion. */
export async function deleteTutorial(id,revision){
 const db=await database();
 try{await new Promise((resolve,reject)=>{
  const tx=db.transaction(['drafts','library','deleted'],'readwrite');let failure;
  tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(failure||tx.error);
  const library=tx.objectStore('library'),read=library.get(id);
  read.onsuccess=()=>{if(!read.result||read.result.revision!==revision){failure=new DraftConflict();tx.abort();return;}
   library.delete(id);tx.objectStore('deleted').put(true,id);
   const drafts=tx.objectStore('drafts'),current=drafts.get('current');current.onsuccess=()=>{if(current.result?.id===id)drafts.delete('current');};
  };
 });}finally{db.close();}
}

export async function wasTutorialDeleted(id){
 const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('deleted').objectStore('deleted').get(id);r.onsuccess=()=>resolve(!!r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}
}
