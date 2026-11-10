const correctionForm = document.getElementById('correction-form');
const correctionTopic = document.getElementById('correction-topic');
const correctionOutput = document.getElementById('correction-output');
const correctionStatus = document.getElementById('correction-status');
const copyDraft = document.getElementById('copy-draft');
correctionTopic.value = (new URLSearchParams(location.search).get('topic') || '').slice(0, 160);
correctionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const detail = document.getElementById('correction-detail').value.trim();
  const source = document.getElementById('correction-source').value.trim();
  if (source && !/^https?:\/\//i.test(source)) {
    correctionStatus.textContent = 'Use an http or https link to the official source.';
    return;
  }
  correctionOutput.value = `PermitGU correction draft\nPage or topic: ${correctionTopic.value.trim()}\n\nCorrection:\n${detail}\n\nOfficial source: ${source || 'Not provided. Needs agency confirmation.'}\n\nThis draft has not been submitted or verified.`;
  correctionOutput.hidden = false;
  document.getElementById('draft-label').hidden = false;
  copyDraft.hidden = false;
  correctionStatus.textContent = 'Draft ready. Nothing has been submitted.';
  correctionOutput.focus();
});
copyDraft.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(correctionOutput.value);
    correctionStatus.textContent = 'Copied. Share it manually with your existing project contact.';
  } catch {
    correctionOutput.focus();
    correctionOutput.select();
    correctionStatus.textContent = 'Select and copy the draft manually. Nothing has been submitted.';
  }
});
