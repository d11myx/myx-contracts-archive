export * from './constants';
export * from './contract-deployments';
export * from './hardhat-config-helpers';
export * from '../tasks/misc/print-deployments';
export * from '../types';

import { loadTasks } from './hardhat-config-helpers';

const TASK_FOLDERS = ['../tasks/misc'];

// Load all plugin tasks
loadTasks(TASK_FOLDERS);
