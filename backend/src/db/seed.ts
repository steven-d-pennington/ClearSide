/**
 * Database Seed Script
 * Populates the database with sample data for development and testing
 */

import { debateRepository, utteranceRepository, interventionRepository } from './index.js';
import { closePool } from './connection.js';
import type { CreateDebateInput, CreateUtteranceInput, CreateInterventionInput } from '../types/database.js';

/**
 * Sample debates for testing
 */
const sampleDebates: CreateDebateInput[] = [
  {
    propositionText: 'AI data centers should be subject to a moratorium until environmental impact is fully assessed',
    propositionContext: {
      category: 'Technology & Environment',
      background:
        'The rapid expansion of AI data centers has raised concerns about energy consumption, water usage, and carbon emissions. Proponents argue that a pause is needed to assess long-term environmental impacts, while opponents contend that such a moratorium would stifle innovation and economic growth.',
      stakeholders: ['Tech companies', 'Environmental groups', 'Government regulators', 'Local communities'],
      timeframe: 'Immediate to 5 years',
    },
  },
  {
    propositionText: 'Universal Basic Income should be implemented nationwide',
    propositionContext: {
      category: 'Economics & Social Policy',
      background:
        'As automation threatens traditional employment, Universal Basic Income (UBI) has emerged as a proposed solution. Supporters argue it provides economic security and simplifies welfare, while critics worry about costs and work disincentives.',
      stakeholders: ['Workers', 'Businesses', 'Government', 'Economists'],
      timeframe: '10-20 years',
    },
  },
  {
    propositionText: 'Social media platforms should be required to verify user identities',
    propositionContext: {
      category: 'Technology & Privacy',
      background:
        'Anonymous accounts on social media have been linked to harassment, misinformation, and foreign interference. Identity verification could reduce these harms but raises privacy concerns and may chill free speech.',
      stakeholders: ['Social media companies', 'Users', 'Government regulators', 'Civil liberties groups'],
      timeframe: 'Immediate to 3 years',
    },
  },
];

/**
 * Sample utterances for the first debate (AI Data Centers)
 */
async function seedUtterances(debateId: string): Promise<void> {
  const utterances: CreateUtteranceInput[] = [
    {
      debateId,
      timestampMs: 0,
      phase: 'opening_statements',
      speaker: 'moderator',
      content:
        'Welcome to this debate on whether AI data centers should be subject to a moratorium until environmental impact is fully assessed. We will proceed through six phases: opening statements, clarifying questions, evidence presentation, rebuttals, synthesis, and closing statements.',
      metadata: {
        model: 'gpt-4',
        tokens: 45,
      },
    },
    {
      debateId,
      timestampMs: 5000,
      phase: 'opening_statements',
      speaker: 'pro_advocate',
      content:
        "I argue in favor of a moratorium on AI data centers. The evidence is clear: data centers consume approximately 1-2% of global electricity, and this is projected to reach 8% by 2030. AI workloads are particularly energy-intensive, with training a single large language model emitting as much CO2 as five cars over their lifetimes. We cannot afford to wait until the damage is irreversible. A temporary pause would allow us to develop renewable energy infrastructure and establish clear environmental standards before expansion continues.",
      metadata: {
        model: 'gpt-4',
        tokens: 92,
      },
    },
    {
      debateId,
      timestampMs: 25000,
      phase: 'opening_statements',
      speaker: 'con_advocate',
      content:
        'I oppose this moratorium. While environmental concerns are valid, a blanket moratorium would be counterproductive. AI is already helping solve climate change through optimized energy grids, climate modeling, and materials discovery. Halting this progress would delay solutions to the very problems we aim to address. Furthermore, the industry is rapidly improving efficiency—new data centers are 50% more energy-efficient than those from five years ago. Instead of a moratorium, we should implement performance standards that encourage innovation while protecting the environment.',
      metadata: {
        model: 'gpt-4',
        tokens: 98,
      },
    },
    {
      debateId,
      timestampMs: 48000,
      phase: 'clarifying_questions',
      speaker: 'moderator',
      content:
        'Pro advocate, could you clarify what duration you propose for this moratorium and what specific criteria would need to be met before lifting it?',
      metadata: {
        model: 'gpt-4',
        tokens: 32,
      },
    },
    {
      debateId,
      timestampMs: 52000,
      phase: 'clarifying_questions',
      speaker: 'pro_advocate',
      content:
        'I propose a 2-3 year moratorium on new data center construction, with the following lifting criteria: (1) Independent environmental impact assessments completed for all planned facilities, (2) Renewable energy commitments of at least 90% for new data centers, (3) Water usage reduction targets established and verified, and (4) Carbon offset programs audited and certified by third parties.',
      metadata: {
        model: 'gpt-4',
        tokens: 78,
      },
    },
  ];

  for (const utterance of utterances) {
    await utteranceRepository.create(utterance);
  }

  console.log(`  ✅ Created ${utterances.length} sample utterances for debate ${debateId.substring(0, 8)}...`);
}

/**
 * Sample interventions for the first debate
 */
async function seedInterventions(debateId: string): Promise<void> {
  const interventions: CreateInterventionInput[] = [
    {
      debateId,
      timestampMs: 30000,
      interventionType: 'question',
      content: 'What about data centers that already use 100% renewable energy? Would they also be subject to the moratorium?',
      directedTo: 'pro_advocate',
    },
    {
      debateId,
      timestampMs: 45000,
      interventionType: 'evidence_injection',
      content:
        'I found a recent study showing that AI-optimized cooling systems have reduced data center energy consumption by 40% in some facilities. This seems relevant to the efficiency discussion.',
      directedTo: 'con_advocate',
    },
  ];

  for (const intervention of interventions) {
    const created = await interventionRepository.create(intervention);

    // Add response to the first intervention
    if (intervention.timestampMs === 30000) {
      await interventionRepository.addResponse(
        created.id,
        'Excellent question. My proposal would exempt data centers that can demonstrate 100% renewable energy usage through verified power purchase agreements or on-site generation. The moratorium is primarily aimed at facilities that would add to fossil fuel demand.',
        35000
      );
    }
  }

  console.log(`  ✅ Created ${interventions.length} sample interventions for debate ${debateId.substring(0, 8)}...`);
}

/**
 * Main seed function
 */
async function seed(): Promise<void> {
  console.log('🌱 Starting database seed...\n');

  try {
    // Create sample debates
    console.log('📝 Creating sample debates...');
    for (const debateInput of sampleDebates) {
      const debate = await debateRepository.create(debateInput);
      console.log(`  ✅ Created debate: "${debate.propositionText.substring(0, 50)}..."`);

      // Only seed utterances and interventions for the first debate (full example)
      if (debateInput === sampleDebates[0]) {
        await seedUtterances(debate.id);
        await seedInterventions(debate.id);

        // Update the first debate to 'live' status
        await debateRepository.updateStatus(debate.id, {
          status: 'live',
          currentPhase: 'clarifying_questions',
          currentSpeaker: 'pro_advocate',
        });
        await debateRepository.markStarted(debate.id);
        console.log(`  ✅ Updated debate status to 'live'`);
      }
    }

    console.log('\n🎉 Database seed completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`  - Debates created: ${sampleDebates.length}`);
    console.log(`  - Utterances created: 5 (for first debate)`);
    console.log(`  - Interventions created: 2 (for first debate)`);
    console.log('\n💡 You can now test the API with these sample debates!');
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run seed if this file is executed directly
seed();
