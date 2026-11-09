import { describeRepositoryContract } from '../contract/repository.contract';
import { MemoryDataLayer } from './store';

describeRepositoryContract('memory', async () => new MemoryDataLayer());
