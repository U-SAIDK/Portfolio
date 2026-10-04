'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { topId } = require('./helpers');

// question -> regex the top-ranked chunk id must match. These are the
// questions a recruiter is most likely to ask; if a knowledge edit or a
// ranking tweak breaks one, this is where it shows up.
const CASES = [
  ['What are his main skills?', /^skills-overview$/],
  ['What is his tech stack?', /^skills-overview$/],
  ['Tell me about his projects', /^projects-overview$/],
  ['Where does he work?', /^(experience-overview|profile-overview)$/],
  ['How can I contact him?', /^contact$/],
  ['What is his email?', /^contact$/],
  ['What is his phone number?', /^contact$/],
  ['what is his github', /^contact$/],
  ['Does he know Kubernetes?', /^skills-devops$/],
  ['Does he have experience with React?', /^(skills-frontend|skills-overview)$/],
  ['What databases has he used?', /^skills-databases$/],
  ['What cloud platforms does he use?', /^skills-cloud$/],
  ['testing experience?', /^skills-testing$/],
  ['What AI work has he done?', /^skills-ai$/],
  ['What certifications does he have?', /^certifications-/],
  ['Where did he study?', /^education$/],
  ['What is his CGPA?', /^education$/],
  ['Is he available for hire?', /^availability$/],
  ['Can I download his CV?', /^resume$/],
  ['What languages does he speak?', /^location-languages$/],
  ['Where is he based?', /^(location-languages|profile-overview|contact)$/],
  ['Tell me about his internship', /^experience-intern$/],
  ['Tell me about TherapyCRM', /^project-therapycrm$/],
  ['what is examforge', /^project-examforge$/],
  ['nursery management system', /^project-nms$/],
  ['snorkel', /^project-snorkel-ai$/],
  ['Angular migration', /^(experience-enterprise|skills-frontend)$/],
  ['What did he do on the fintech platform?', /^(experience-fintech|project-simpleaccounts)$/],
  ['What is his biggest achievement?', /^experience-backend-impact$/],
  ['how was this website built', /^project-portfolio$/],
];

for (const [question, expected] of CASES) {
  test(`retrieves the right chunk for: ${question}`, () => {
    const id = topId(question);
    assert.ok(id, 'expected a confident hit, got out-of-scope');
    assert.match(id, expected);
  });
}

test('stopword-only identity questions are rewritten, not dropped', () => {
  assert.equal(topId('Who is Usaid?'), 'profile-overview');
  assert.equal(topId('What does he do?'), 'profile-overview');
  assert.equal(topId('Who are you?'), 'assistant');
  assert.equal(topId('tell me about yourself'), 'assistant');
});

test('thin follow-ups retrieve using the previous question', () => {
  assert.equal(topId('what tech did he use there?', 'Tell me about ExamForge'), 'project-examforge');
  assert.equal(topId('and the stack?', 'Tell me about NMS'), 'project-nms');
});

test('a self-contained follow-up ignores the previous question', () => {
  assert.equal(topId('What is his CGPA?', 'Tell me about ExamForge'), 'education');
});
