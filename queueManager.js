const config = require('./config');

// queues[queueType] = Set of { userId, username, guildMember }
const queues = {
  ranked_cb: new Map(),
  open_cb:   new Map(),
  ranked_n:  new Map(),
  open_n:    new Map(),
};

// Determine queue type from channel ID
function getQueueTypeByChannel(channelId) {
  const ch = config.CHANNELS;
  if (channelId === ch.RANKED_CB_QUEUE) return 'ranked_cb';
  if (channelId === ch.OPEN_CB_QUEUE)   return 'open_cb';
  if (channelId === ch.RANKED_N_QUEUE)  return 'ranked_n';
  if (channelId === ch.OPEN_N_QUEUE)    return 'open_n';
  return null;
}

function isValidQueueChannel(channelId) {
  return getQueueTypeByChannel(channelId) !== null;
}

function getQueue(queueType) {
  return queues[queueType];
}

function isInAnyQueue(userId) {
  for (const q of Object.values(queues)) {
    if (q.has(userId)) return true;
  }
  return false;
}

function getQueueTypeForUser(userId) {
  for (const [type, q] of Object.entries(queues)) {
    if (q.has(userId)) return type;
  }
  return null;
}

function addToQueue(queueType, userId, username) {
  if (isInAnyQueue(userId)) return { success: false, reason: 'already_queued' };
  queues[queueType].set(userId, { userId, username });
  return { success: true, size: queues[queueType].size };
}

function removeFromQueue(userId) {
  for (const q of Object.values(queues)) {
    if (q.has(userId)) { q.delete(userId); return true; }
  }
  return false;
}

function getQueuePlayers(queueType) {
  return Array.from(queues[queueType].values());
}

function isFull(queueType) {
  return queues[queueType].size >= config.QUEUE_SIZE;
}

function clearQueue(queueType) {
  queues[queueType].clear();
}

function queueStatus(queueType) {
  const q = queues[queueType];
  return { size: q.size, max: config.QUEUE_SIZE, players: Array.from(q.values()) };
}

function labelForType(queueType) {
  const labels = {
    ranked_cb: '🏆 Ranked Curveball',
    open_cb:   '🎯 Open Curveball',
    ranked_n:  '🚀 Ranked Normal (3v3)',
    open_n:    '⚽ Open Normal (3v3)',
  };
  return labels[queueType] || queueType;
}

module.exports = {
  getQueueTypeByChannel,
  isValidQueueChannel,
  getQueue,
  isInAnyQueue,
  getQueueTypeForUser,
  addToQueue,
  removeFromQueue,
  getQueuePlayers,
  isFull,
  clearQueue,
  queueStatus,
  labelForType,
};
