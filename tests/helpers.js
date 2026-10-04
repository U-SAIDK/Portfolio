'use strict';

const path = require('path');

const RAG = require('../public/assets/js/rag-engine.js');
const knowledge = require('../public/assets/data/knowledge.json');

const index = RAG.createIndex(knowledge);

/** Id of the top-ranked chunk for a question, or null when out of scope. */
function topId(question, previous) {
  const result = RAG.search(index, RAG.prepareQuery(question, previous));
  return result.confident ? result.hits[0].chunk.id : null;
}

module.exports = { RAG, knowledge, index, topId, ROOT: path.join(__dirname, '..') };
