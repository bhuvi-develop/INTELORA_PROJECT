import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Settings as SettingsIcon,
  Save,
  Power,
  Eye,
  EyeOff,
  X,
  Server,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { systemService } from '@/services/platform.service';
import type { MqttProfileDto } from '@/types/api';

interface MqttConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

const DEFAULT_NEW_PROFILE: MqttProfileDto = {
  name: 'New Connection',
  protocol: 'mqtt://',
  host: '127.0.0.1',
  port: 1883,
  username: '',
  password: '',
  validate_cert: true,
  use_tls: false,
  topic: 'intelora/mikos/telemetry/#',
  qos: 1,
  keepalive: 60,
  client_id: 'mikos_sensor_client',
};

export const MqttConnectionModal: React.FC<MqttConnectionModalProps> = ({
  isOpen,
  onClose,
  onConnected,
}) => {
  const [profiles, setProfiles] = useState<MqttProfileDto[]>([]);
  const [activeProfileName, setActiveProfileName] = useState<string>('HYD VM');
  const [selectedProfileName, setSelectedProfileName] = useState<string>('HYD VM');
  const [formData, setFormData] = useState<MqttProfileDto>({ ...DEFAULT_NEW_PROFILE, name: 'HYD VM' });

  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      const res = await systemService.getMqttProfiles();
      setProfiles(res.profiles || []);
      setActiveProfileName(res.active_profile);

      const targetName = selectedProfileName || res.active_profile;
      const found = res.profiles?.find((p: MqttProfileDto) => p.name === targetName) || res.profiles?.[0];
      if (found) {
        setSelectedProfileName(found.name);
        setFormData({ ...found });
      }
    } catch (err: any) {
      setStatusMsg(`Failed to load MQTT profiles: ${err.message || 'Error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadProfiles();
    }
  }, [isOpen]);

  const handleSelectProfile = (name: string) => {
    setSelectedProfileName(name);
    const found = profiles.find((p) => p.name === name);
    if (found) {
      setFormData({ ...found });
      setTestResult(null);
      setStatusMsg(null);
    }
  };

  const handleCreateNew = () => {
    const newName = `Connection ${profiles.length + 1}`;
    const newProfile: MqttProfileDto = { ...DEFAULT_NEW_PROFILE, name: newName };
    setProfiles([...profiles, newProfile]);
    setSelectedProfileName(newName);
    setFormData(newProfile);
    setTestResult(null);
    setStatusMsg('Draft connection created. Click Save when ready.');
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setStatusMsg(null);
      await systemService.saveMqttProfile(formData);
      setStatusMsg(`Saved "${formData.name}" configuration successfully.`);
      await loadProfiles();
    } catch (err: any) {
      setStatusMsg(`Error saving profile: ${err.message || 'Failed'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!formData.name) return;
    if (profiles.length <= 1) {
      setStatusMsg('Cannot delete the only connection profile.');
      return;
    }

    try {
      setLoading(true);
      await systemService.deleteMqttProfile(formData.name);
      setStatusMsg(`Deleted profile "${formData.name}".`);
      const nextProfiles = profiles.filter((p) => p.name !== formData.name);
      setProfiles(nextProfiles);
      if (nextProfiles.length > 0) {
        setSelectedProfileName(nextProfiles[0].name);
        setFormData({ ...nextProfiles[0] });
      }
    } catch (err: any) {
      setStatusMsg(`Error deleting profile: ${err.message || 'Failed'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setLoading(true);
      setTestResult(null);
      const res = await systemService.testMqttConnection(formData.host, formData.port);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || 'TCP test failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setLoading(true);
      setStatusMsg(null);

      // Save changes first
      await systemService.saveMqttProfile(formData);
      // Connect to active profile
      const res = await systemService.connectMqttProfile(formData.name);

      if (res.status === 'connected') {
        setActiveProfileName(formData.name);
        setStatusMsg(`Successfully connected to ${formData.name}!`);
        if (onConnected) onConnected();
        setTimeout(() => onClose(), 800);
      } else {
        setStatusMsg(`Connection attempt sent for ${formData.name}.`);
      }
    } catch (err: any) {
      setStatusMsg(`Connection failed: ${err.message || 'Error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl rounded-2xl bg-[#1e232d] border border-white/10 shadow-2xl text-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-[#181c24]">
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">MQTT Broker Connection</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal body grid */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel: Connections list */}
          <div className="w-1/3 border-r border-white/10 bg-[#161a22] p-4 flex flex-col gap-3">
            <button
              onClick={handleCreateNew}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs transition-colors shadow-md"
            >
              <Plus className="h-4 w-4 stroke-[3]" />
              Connections
            </button>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {profiles.map((p) => {
                const isSelected = p.name === selectedProfileName;
                const isActive = p.name === activeProfileName;
                return (
                  <div
                    key={p.name}
                    onClick={() => handleSelectProfile(p.name)}
                    className={`cursor-pointer rounded-xl p-3 border transition-all ${
                      isSelected
                        ? 'bg-[#252c39] border-amber-400/50 shadow-sm'
                        : 'bg-[#1c212b] border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white truncate">{p.name}</span>
                      {isActive && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-medium border border-emerald-500/30">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-1">
                      {p.protocol || 'mqtt://'}
                      {p.host}:{p.port}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel: Connection Form */}
          <div className="flex-1 p-6 overflow-y-auto bg-[#1e232d] flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              {/* Form Title banner */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-xl font-bold text-white tracking-wide">
                  MQTT Connection
                </span>
                <span className="font-mono text-xs text-slate-400">
                  {formData.protocol || 'mqtt://'}
                  {formData.host}:{formData.port}/
                </span>
              </div>

              {/* Top row: Name & Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-lg bg-[#141820] border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>

                <div className="flex items-center justify-between bg-[#141820] border border-white/10 rounded-lg p-2.5">
                  <span className="text-xs font-medium text-slate-300">Validate certificate</span>
                  <input
                    type="checkbox"
                    checked={formData.validate_cert ?? true}
                    onChange={(e) => setFormData({ ...formData, validate_cert: e.target.checked })}
                    className="h-4 w-4 rounded accent-amber-400 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between bg-[#141820] border border-white/10 rounded-lg p-2.5">
                  <span className="text-xs font-medium text-slate-300">Encryption (tls)</span>
                  <input
                    type="checkbox"
                    checked={formData.use_tls ?? false}
                    onChange={(e) => setFormData({ ...formData, use_tls: e.target.checked })}
                    className="h-4 w-4 rounded accent-amber-400 cursor-pointer"
                  />
                </div>
              </div>

              {/* Second row: Protocol, Host, Port */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Protocol
                  </label>
                  <select
                    value={formData.protocol || 'mqtt://'}
                    onChange={(e) => setFormData({ ...formData, protocol: e.target.value })}
                    className="w-full rounded-lg bg-[#141820] border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                  >
                    <option value="mqtt://">mqtt://</option>
                    <option value="mqtts://">mqtts://</option>
                    <option value="ws://">ws://</option>
                    <option value="wss://">wss://</option>
                  </select>
                </div>

                <div className="md:col-span-6 space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Host
                  </label>
                  <input
                    type="text"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    className="w-full rounded-lg bg-[#141820] border border-white/15 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                    placeholder="172.176.255.143"
                  />
                </div>

                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Port
                  </label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) })}
                    className="w-full rounded-lg bg-[#141820] border border-white/15 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Third row: Username & Password */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Username
                  </label>
                  <input
                    type="text"
                    value={formData.username || ''}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full rounded-lg bg-[#141820] border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    placeholder="Optional username"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password || ''}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full rounded-lg bg-[#141820] border border-white/15 pl-3 pr-10 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      placeholder="Optional password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Advanced Expander */}
              {showAdvanced && (
                <div className="rounded-xl bg-[#141820] border border-white/10 p-4 space-y-3 animate-in fade-in duration-150">
                  <h4 className="text-xs font-semibold text-amber-400 tracking-wide uppercase">
                    Advanced Broker Parameters
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Subscription Topic</label>
                      <input
                        type="text"
                        value={formData.topic || 'intelora/mikos/telemetry/#'}
                        onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                        className="w-full rounded bg-[#1c212b] border border-white/10 px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Client ID</label>
                      <input
                        type="text"
                        value={formData.client_id || 'mikos_backend'}
                        onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                        className="w-full rounded bg-[#1c212b] border border-white/10 px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">QoS (Quality of Service)</label>
                      <select
                        value={formData.qos ?? 1}
                        onChange={(e) => setFormData({ ...formData, qos: Number(e.target.value) })}
                        className="w-full rounded bg-[#1c212b] border border-white/10 px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value={0}>QoS 0 - At most once</option>
                        <option value={1}>QoS 1 - At least once</option>
                        <option value={2}>QoS 2 - Exactly once</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Keepalive (Seconds)</label>
                      <input
                        type="number"
                        value={formData.keepalive ?? 60}
                        onChange={(e) => setFormData({ ...formData, keepalive: Number(e.target.value) })}
                        className="w-full rounded bg-[#1c212b] border border-white/10 px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Status / Feedback messages */}
              {statusMsg && (
                <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-2.5 text-xs text-blue-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" />
                  <span>{statusMsg}</span>
                </div>
              )}

              {testResult && (
                <div
                  className={`rounded-lg p-2.5 text-xs flex items-center gap-2 border ${
                    testResult.ok
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

            {/* Bottom Buttons Row: matching the screenshot layout exactly */}
            <div className="flex items-center justify-between border-t border-white/10 pt-4 mt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700/60 hover:bg-rose-600/80 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  DELETE
                </button>

                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700/60 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition-colors"
                >
                  <SettingsIcon className="h-3.5 w-3.5" />
                  ADVANCED
                </button>

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700/60 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition-colors"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  TEST
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-md transition-colors disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  SAVE
                </button>

                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-6 py-2 rounded-lg bg-[#1f4a56] hover:bg-[#275c6c] text-white font-bold text-xs shadow-md transition-colors disabled:opacity-50 border border-teal-500/30"
                >
                  <Power className="h-3.5 w-3.5 text-teal-400" />
                  CONNECT
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
