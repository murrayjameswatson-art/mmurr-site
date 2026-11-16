/* ----------------------------------------------------------------------------
   mmurr.ai — Impact Handbook: the T&D toggle (generation-only vs delivered
   energy). Moved out of an inline <script> so the page's Content Security
   Policy can forbid inline script entirely.
---------------------------------------------------------------------------- */
(function(){
  var t=document.getElementById('tdToggle'),s=document.getElementById('tdState');
  if(!t)return;
  function apply(){
    var on=t.checked;
    document.body.classList.toggle('td',on);
    if(s)s.textContent=on?'generation + T&D (delivered energy)':'generation only';
    document.querySelectorAll('.tdv').forEach(function(el){
      el.textContent=on?el.dataset.t:el.dataset.g;
    });
  }
  t.addEventListener('change',apply);
  apply();
})();
