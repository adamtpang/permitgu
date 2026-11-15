const correctionForm = document.getElementById('correction-form');
const correctionTopic = document.getElementById('correction-topic');
const correctionOutput = document.getElementById('correction-output');
const correctionStatus = document.getElementById('correction-status');
const copyDraft = document.getElementById('copy-draft');
const sendButton = correctionForm.querySelector('button[type="submit"]');
correctionTopic.value = (new URLSearchParams(location.search).get('topic') || '').slice(0, 160);

const PROBLEMS = {
  empty: 'Add the page or topic and what needs correcting.',
  not_ready: 'Add the page or topic and what needs correcting.',
  bad_source: 'Use an http or https link to the official source.',
  too_long: 'That is too long to send. Shorten it and try again.',
  too_large: 'That is too long to send. Shorten it and try again.',
  rate_limited: 'You have sent several in a short time. Please wait a while and try again.',
};

// If sending fails, the person still leaves with their words in a copyable draft.
function showDraft(topic, detail, source, contact) {
  correctionOutput.value = `PermitGU correction\nPage or topic: ${topic}\n\nCorrection:\n${detail}\n\nOfficial source: ${source || 'Not provided. Needs agency confirmation.'}${contact ? `\nContact: ${contact}` : ''}\n\nThis was not sent.`;
  correctionOutput.hidden = false;
  document.getElementById('draft-label').hidden = false;
  copyDraft.hidden = false;
}

correctionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const topic = correctionTopic.value.trim();
  const detail = document.getElementById('correction-detail').value.trim();
  const source = document.getElementById('correction-source').value.trim();
  const contact = document.getElementById('correction-contact').value.trim();
  const website = document.getElementById('correction-website').value;
  if (source && !/^https?:\/\//i.test(source)) {
    correctionStatus.textContent = PROBLEMS.bad_source;
    return;
  }
  sendButton.disabled = true;
  correctionStatus.textContent = 'Sending.';
  let result = null;
  try {
    const response = await fetch('/api/contribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, detail, source, contact, website }),
      signal: AbortSignal.timeout(15000),
    });
    result = { status: response.status, body: await response.json().catch(() => ({})) };
  } catch {
    result = null;
  }
  sendButton.disabled = false;
  if (result && result.body.ok) {
    correctionForm.reset();
    correctionTopic.value = topic;
    correctionOutput.hidden = true;
    document.getElementById('draft-label').hidden = true;
    copyDraft.hidden = true;
    correctionStatus.textContent = 'Sent. Thank you. It stays unconfirmed until it is checked against an official source.';
    return;
  }
  const known = result && PROBLEMS[result.body.error];
  if (known) {
    correctionStatus.textContent = known;
    return;
  }
  showDraft(topic, detail, source, contact);
  correctionStatus.textContent = 'This could not be sent right now. Your words are in the draft below so they are not lost.';
  correctionOutput.focus();
});

copyDraft.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(correctionOutput.value);
    correctionStatus.textContent = 'Copied.';
  } catch {
    correctionOutput.focus();
    correctionOutput.select();
    correctionStatus.textContent = 'Select and copy the draft yourself.';
  }
});
