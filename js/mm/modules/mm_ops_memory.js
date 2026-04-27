window.MMOpsMemory=(function(){

function render(){

  const d=MM_STATE.dashboard || {};

  document.getElementById("active-build-context").innerHTML =
    d?.active_build_context?.current_task || "--";

  document.getElementById("handoff-memory").innerHTML =
    d?.handoff_memory?.next_task || "--";

  document.getElementById("risk-list").innerHTML =
    (d.blockers||[])
      .map(x=>x.title)
      .join("<br>");

  document.getElementById("milestone-list").innerHTML =
    (d.milestones||[])
      .map(x=>x.name)
      .join("<br>");
}

return {render};

})();
