/** Imports and editor publication share the authoring queue, then campaign queue.
 * Always acquire them in this order: departure preparation uses the latter directly. */
export function enqueueCaseWrite(cases,run){
  const owner=game.pms?.editorService??cases;
  const job=(owner.queue??Promise.resolve()).then(()=>{
    const execute=()=>{cases.gm();return run();},avatars=game.pms?.avatars;
    if(!avatars)return execute();
    const campaignJob=(avatars.queue??Promise.resolve()).then(execute);
    avatars.queue=campaignJob.catch(()=>{});return campaignJob;
  });
  owner.queue=job.catch(()=>{});return job;
}
