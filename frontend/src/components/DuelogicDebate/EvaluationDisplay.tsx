import React from 'react';
import styles from './EvaluationDisplay.module.css';

interface EvaluationDisplayProps {
    evaluation: {
        adherenceScore: number;
        steelManning: { attempted: boolean; quality: string; notes?: string };
        selfCritique: { attempted: boolean; quality: string; notes?: string };
        frameworkConsistency: { consistent: boolean; violations?: string[] };
        intellectualHonesty: { score: string; issues?: string[] };
        requiresInterjection: boolean;
    };
}

export const EvaluationDisplay: React.FC<EvaluationDisplayProps> = ({ evaluation }) => {
    const getQualityColor = (quality: string) => {
        switch (quality) {
            case 'strong': return 'var(--color-success)';
            case 'adequate': return 'var(--color-info)';
            case 'weak': return 'var(--color-warning)';
            case 'absent': return 'var(--color-error)';
            default: return 'var(--color-text-muted)';
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'var(--color-success)';
        if (score >= 60) return 'var(--color-info)';
        if (score >= 40) return 'var(--color-warning)';
        return 'var(--color-error)';
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <span className={styles.label}>Duelogic Adherence</span>
                <span
                    className={styles.score}
                    style={{ color: getScoreColor(evaluation.adherenceScore) }}
                >
                    {evaluation.adherenceScore}%
                </span>
            </div>

            <div className={styles.metrics}>
                <div className={styles.metric}>
                    <span className={styles.metricLabel}>Steel-Manning</span>
                    <span
                        className={styles.metricValue}
                        style={{ color: getQualityColor(evaluation.steelManning.quality) }}
                    >
                        {evaluation.steelManning.quality}
                        {evaluation.steelManning.attempted && ' ✓'}
                    </span>
                </div>

                <div className={styles.metric}>
                    <span className={styles.metricLabel}>Self-Critique</span>
                    <span
                        className={styles.metricValue}
                        style={{ color: getQualityColor(evaluation.selfCritique.quality) }}
                    >
                        {evaluation.selfCritique.quality}
                        {evaluation.selfCritique.attempted && ' ✓'}
                    </span>
                </div>

                <div className={styles.metric}>
                    <span className={styles.metricLabel}>Consistency</span>
                    <span
                        className={styles.metricValue}
                        style={{ color: evaluation.frameworkConsistency.consistent ? 'var(--color-success)' : 'var(--color-error)' }}
                    >
                        {evaluation.frameworkConsistency.consistent ? 'High' : 'Violations'}
                    </span>
                </div>
            </div>

            {evaluation.requiresInterjection && (
                <div className={styles.interjectionAlert}>
                    ⚠️ Interjection Triggered
                </div>
            )}
        </div>
    );
};
