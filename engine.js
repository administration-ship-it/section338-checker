(function (root) {
  'use strict';
  function normalize(value) {
    const s=String(value??'').trim();
    if(!/^(?:\d{8}|\d{10}|\d{4}\.\d{2}\.\d{2}(?:\d{2}|\.\d{2})?)$/.test(s)) throw Error('hts');
    return s.replace(/\./g,'');
  }
  function moment(value) {
    const s=String(value??'').trim();
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(s)) throw Error('dates');
    const n=Date.parse(s); if(!Number.isFinite(n)) throw Error('dates'); return n;
  }
  function easternISO(value) {
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error('dates');
    const f=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const candidates=['-04:00','-05:00'].filter(offset=>{
      const d=new Date(value+offset); if(!Number.isFinite(d.getTime())) return false;
      const p=Object.fromEntries(f.formatToParts(d).map(x=>[x.type,x.value]));
      return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`===value;
    });
    if(candidates.length!==1) throw Error('dates');
    return value+candidates[0];
  }
  function screen(row,R) {
    const out={status:'REVIEW',reason:'',code:'',group:'',rate:null,source:'',stacking:false,transition:false,futureBan:false,bulk:false,version:R.version};
    const finish=(status,reason,rate=null)=>Object.assign(out,{status,reason,rate});
    try {
      const code=normalize(row.hts); out.code=code;
      const origin=String(row.origin??'').trim().toUpperCase();
      if(['','UNKNOWN','ZZ','XX','UN'].includes(origin)) return finish('REVIEW','origin');
      if(!['CA','CAN','CANADA'].includes(origin)) {
        if(!/^[A-Z]{2}$/.test(origin)) return finish('REVIEW','origin');
        return finish('OUTSIDE_CANADA_RULE','outside');
      }
      const imported=moment(row.imported_at),entered=moment(row.entered_at),start=moment(R.baseline_effective),scope=moment(R.scope_effective),banAt=moment(R.ban_effective);
      if(entered<imported) return finish('REVIEW','chronology');
      const flag=(value,allowed)=>{const s=String(value||'unknown').trim().toLowerCase();if(!allowed.includes(s))throw Error('facts');return s;};
      const packaged=flag(row.packaged,['yes','no','unknown']);
      const exemption=flag(row.note51c_eligible,['yes','no','unknown']);
      const special=flag(row.special_review,['none','required','unknown']);
      if(row.customs_value_usd!==undefined && row.customs_value_usd!=='' && (!Number.isFinite(Number(row.customs_value_usd))||Number(row.customs_value_usd)<0)) return finish('REVIEW','value');
      const post=entered>=scope,active=post?R.active_after_scope:R.baseline,key8=code.slice(0,8);
      const group=active[code]||active[key8]||'',ban=R.bans[code]||R.bans[key8];
      const partial=code.length===8&&Object.keys(active).some(k=>k.length===10&&k.startsWith(code));
      const partialBan=code.length===8&&Object.keys(R.bans).some(k=>k.length===10&&k.startsWith(code));
      out.group=group||ban?.group||'';
      out.source=ban?.source_url||(post?R.changes[group]?.source_url:null)||R.baseline_source_url;
      if(imported>=banAt&&(partialBan||partial)) return finish('REVIEW','hts10');
      if(ban&&imported>=banAt) {
        if(ban.packaged_only&&packaged==='unknown') return finish('REVIEW','packaging');
        if(!ban.packaged_only||packaged==='yes') return finish('IMPORT_BANNED','ban');
      }
      if(partial) return finish('REVIEW','hts10');
      if(entered<start) return finish('BEFORE_338_EFFECTIVE','before',0);
      if(!group) {
        const known=Object.hasOwn(R.descriptions,code)||Object.hasOwn(R.baseline,key8);
        if(!post&&(R.active_after_scope[code]||R.active_after_scope[key8])) return finish('BEFORE_SCOPE_ADDITION','addition',0);
        return finish(known?'REMOVED_FROM_338':'NO_338_LIST_MATCH',known?'removed':'no_match',known?0:null);
      }
      if(special!=='none') return finish('REVIEW','special');
      const eligible=!post||group==='dairy'; out.stacking=!eligible;
      out.transition=!!(ban&&imported<banAt&&entered>=banAt&&(!ban.packaged_only||packaged!=='no'));
      if(out.transition) return finish('REVIEW','transition');
      if(eligible&&exemption==='unknown') return finish('REVIEW','exemption');
      if(eligible&&exemption==='yes') return finish('NOTE51C_EXCLUSION','exclusion',0);
      out.futureBan=!!(ban&&imported<banAt); out.bulk=!!(ban?.packaged_only&&packaged==='no');
      return finish('338_DUTY','duty',0.5);
    } catch(e) { return finish('REVIEW',e.message); }
  }
  const api={normalize,easternISO,screen}; root.Section338=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis==='undefined'?this:globalThis);
