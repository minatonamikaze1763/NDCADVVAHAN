/* Display catalog only. The server calculates every checkout and entitlement. */
window.NDCPlans = (() => {
  let plans = [];
  const labels = {
    automaticUploadRecovery: "Upload recovery assistance",
    liveUploadActivityLogs: "Live upload activity logs",
    submissionSummary: "Readable submission summary",
    localApplicationDetails: "Locally saved application details",
    rtaOfficeSummary: "RTA office in your summary",
    autoCopySubmissionDetails: "Optional clipboard copy of application details"
  };
  const label = key => labels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
  const ready = fetch("https://server.nextdimensioncustoms.in/api/public/subscription-plans", { cache: "no-store" })
    .then(async response => {
      if (!response.ok) throw Error("Unable to load subscription plans.");
      const data = await response.json();
      if (!Array.isArray(data.plans)) throw Error("Subscription plans are unavailable.");
      plans = data.plans.filter(p => p.status === "active"); return plans;
    });
  ready.catch(() => { });
  return {
    ready,
    label,
    featureLabel: (plan, key) => plan.featureLabels?.[key] || label(key),
    get all() {
      return structuredClone(plans);
    },
    get visible() {
      return structuredClone(plans);
    }
  };

})();
