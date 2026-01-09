import * as dotenv from 'dotenv';
dotenv.config();

import { createVectorDBClient, getVectorDBProvider } from './src/services/research/vector-db-factory.js';

async function main() {
  const proposalId = '60ab831e-0d85-4edc-bf18-a8f4a059cfed';

  console.log('Vector DB Provider:', getVectorDBProvider());

  const client = createVectorDBClient();
  if (!client) {
    console.log('No vector DB client available');
    return;
  }

  console.log('Checking for indexed research...');

  try {
    const hasResearch = await client.hasIndexedResearch(proposalId);
    console.log(`Has indexed research for proposal ${proposalId}:`, hasResearch);

    if (hasResearch) {
      // Try to query some vectors
      const dummyVector = new Array(1536).fill(0.01);
      const results = await client.query(proposalId, dummyVector, 3);
      console.log(`Found ${results.length} research vectors`);
      results.forEach((r, i) => {
        console.log(`  [${i + 1}] Score: ${r.score.toFixed(3)}, Title: ${r.metadata.sourceTitle?.slice(0, 50)}`);
      });
    }
  } catch (error) {
    console.error('Error checking research:', error);
  }
}

main();
