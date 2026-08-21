const key = process.env.FAL_KEY;
(async () => {
  const res = await fetch("https://queue.fal.run/bytedance/seedance-2.5/image-to-video", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Key ${key}` },
    body: JSON.stringify({
      prompt: "balance probe",
      image_url: "https://example.com/nonexistent.png",
      duration: 4,
      resolution: "480p",
    }),
  });
  console.log("status:", res.status);
  console.log("body:", (await res.text()).slice(0, 200));
})();
