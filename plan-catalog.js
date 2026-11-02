/* Server-owned plan values; session-only test preview. */
window.NDCPlans = (() => {
  let plans = [];
  const label = key => key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
  const ready = fetch("https://server.nextdimensioncustoms.in/api/public/subscription-plans", { cache: "no-store" })
    .then(async response => {
      if (!response.ok) throw Error("Unable to load subscription plans.");
      const data = await response.json();
      if (!Array.isArray(data.plans) || !data.plans.length) throw Error("Subscription plans are unavailable.");
      plans = data.plans; return plans;
    });
  ready.catch(() => { });
  return {
    ready,
    label,
    get all() {
      return plans.filter(p => ["starter", "pro"].includes(p.id));
    },
    get visible() {
      return plans.filter(p => ["starter", "pro"].includes(p.id));
    }
  };

})();
