import { useEffect } from 'react';
import { useAnomalyJournal, useSnapshot } from '@/engine/store';
import { platformAlertStore } from './alertStore';
import type { PlatformAlert, AlertSeverity, AlertStatus } from '@/types/alerts';
import type { Severity, AnomalyStatus } from '@/engine/types';

const mapSeverity = (sev: Severity): AlertSeverity => {
  if (sev === 'Major') return 'High';
  return sev as AlertSeverity;
};

const mapStatus = (status: AnomalyStatus): AlertStatus => {
  return status as AlertStatus;
};

export const AlertAggregator = () => {
  const anomalies = useAnomalyJournal();
  const snapshot = useSnapshot();

  useEffect(() => {
    const alerts: PlatformAlert[] = [];

    // 1. Process Anomalies
    for (const anomaly of anomalies) {
      alerts.push({
        id: anomaly.id,
        timestamp: anomaly.timestamp,
        module: anomaly.detectionMethod === 'predictive' ? 'Predictive Maintenance' : 'AI Anomaly Detection',
        type: anomaly.type,
        severity: mapSeverity(anomaly.severity),
        deviceId: anomaly.assetId,
        deviceName: anomaly.assetName,
        equipmentType: anomaly.category,
        title: anomaly.title,
        description: anomaly.detail,
        status: mapStatus(anomaly.status),
        recommendedAction: anomaly.component ? `Inspect ${anomaly.component}` : undefined,
        raw: anomaly,
      });
    }

    // 2. Process active predictive signals that are not already tracked in anomalies
    // (If the engine tracks them separately - based on the usePredictiveAlerts logic,
    // predictive signals are already in the anomaly stream if they are surfaced as alerts).
    // The snapshot also holds component predictions which might need to be converted to alerts if they are critical.
    if (snapshot.assets) {
      for (const asset of snapshot.assets) {
        if (asset.prediction && asset.prediction.primary && asset.prediction.primary.failureProbability > 0.8) {
           const p = asset.prediction.primary;
           alerts.push({
             id: `pred-${asset.device.assetId}-${p.component}`,
             timestamp: Date.now(), // Real system would have a prediction timestamp
             module: 'Predictive Maintenance',
             type: 'High Failure Probability',
             severity: p.failureProbability > 0.9 ? 'Critical' : 'High',
             deviceId: asset.device.assetId,
             deviceName: asset.device.assetName,
             equipmentType: asset.device.category,
             title: `High probability of ${p.component} failure`,
             description: `Model predicts failure within ${Math.ceil(p.rulDays)} days.`,
             status: 'Active',
             recommendedAction: p.recommendation,
           });
        }
      }
    }

    platformAlertStore.publishMany(alerts);
  }, [anomalies, snapshot.assets]);

  return null;
};
