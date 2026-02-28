import { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { getSettings, updateSettings, type AppSettings } from '../lib/tauri';
import { useAppStore } from '../lib/store';
import { FolderOpen, RefreshCw, Sun, Moon, Save } from 'lucide-react';

function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { theme, setTheme } = useAppStore();

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const data = await getSettings();
      setSettings(data);
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Use defaults if settings can't be loaded
      setSettings({
        claudeHomePath: '~/.claude',
        autoRefresh: true,
        refreshIntervalMinutes: 5,
        theme: 'dark',
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;

    setIsSaving(true);
    try {
      await updateSettings(settings);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  }

  function handleChange<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setHasChanges(true);

    if (key === 'theme') {
      const themeValue = value as 'light' | 'dark';
      setTheme(themeValue);
      // Apply immediately
      if (themeValue === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col">
        <Header title="Settings" />
        <div className="flex-1 p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-32 rounded-lg bg-[var(--color-surface-alt)]" />
            <div className="h-32 rounded-lg bg-[var(--color-surface-alt)]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Settings"
        subtitle="Configure your Ironhide preferences"
      />

      <div className="flex-1 p-6 space-y-6 max-w-2xl">
        {/* Data Source */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-[var(--color-primary-400)]" />
              <CardTitle>Data Source</CardTitle>
            </div>
            <CardDescription>
              Configure where Claude Code session data is stored
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Claude Home Path
              </label>
              <input
                type="text"
                value={settings?.claudeHomePath || ''}
                onChange={(e) => handleChange('claudeHomePath', e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-500)]"
                placeholder="~/.claude"
              />
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                The directory where Claude Code stores session data (usually ~/.claude)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Auto Refresh */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-[var(--color-primary-400)]" />
              <CardTitle>Auto Refresh</CardTitle>
            </div>
            <CardDescription>
              Automatically sync session data at regular intervals
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Enable auto refresh</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Periodically check for new session data
                </p>
              </div>
              <button
                onClick={() => handleChange('autoRefresh', !settings?.autoRefresh)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings?.autoRefresh ? 'bg-[var(--color-primary-600)]' : 'bg-[var(--color-surface-alt)]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings?.autoRefresh ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {settings?.autoRefresh && (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Refresh interval (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settings?.refreshIntervalMinutes || 5}
                  onChange={(e) =>
                    handleChange('refreshIntervalMinutes', parseInt(e.target.value, 10) || 5)
                  }
                  className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-500)]"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sun className="h-5 w-5 text-[var(--color-primary-400)]" />
              <CardTitle>Appearance</CardTitle>
            </div>
            <CardDescription>
              Customize the look and feel of the application
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-3">
                Theme
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTheme('light');
                    document.documentElement.classList.remove('dark');
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    theme === 'light'
                      ? 'bg-[var(--color-primary-600)] text-white'
                      : 'bg-[var(--color-background)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  <Sun className="h-4 w-4" />
                  Light
                </button>
                <button
                  onClick={() => {
                    setTheme('dark');
                    document.documentElement.classList.add('dark');
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    theme === 'dark'
                      ? 'bg-[var(--color-primary-600)] text-white'
                      : 'bg-[var(--color-background)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  <Moon className="h-4 w-4" />
                  Dark
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save button */}
        {hasChanges && (
          <div className="flex justify-end">
            <Button onClick={saveSettings} isLoading={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Settings;
