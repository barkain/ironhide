import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { cn, formatCurrency, formatCompactNumber, formatDateTime, formatDuration, formatNumber } from '../../lib/utils';
import {
  X,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Clock,
  Zap,
  DollarSign,
  Bot,
  Wrench,
  User,
  MessageSquare,
  Database,
} from 'lucide-react';
import type { TurnSummary } from '../../types';

interface TurnDetailViewProps {
  turn: TurnSummary;
  onClose: () => void;
}

export function TurnDetailView({ turn, onClose }: TurnDetailViewProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['user', 'assistant', 'tokens', 'tools'])
  );
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  const copyToClipboard = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-[var(--color-surface)]">
        {/* Header */}
        <CardHeader className="flex-shrink-0 border-b border-gray-700 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CardTitle className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">Turn #{turn.turn_number}</span>
                {turn.is_subagent && (
                  <Badge variant="warning" className="ml-2">
                    <Bot className="mr-1 h-3 w-3" />
                    Subagent
                  </Badge>
                )}
              </CardTitle>
              {turn.model && (
                <Badge variant="info" className="text-sm">
                  {turn.model}
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          {/* Timestamp row */}
          <div className="flex items-center gap-6 mt-3 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatDateTime(turn.started_at)}
              {turn.ended_at && ` - ${formatDateTime(turn.ended_at)}`}
            </span>
            {turn.duration_ms && (
              <span className="flex items-center gap-1">
                Duration: <span className="text-white">{formatDuration(turn.duration_ms / 1000)}</span>
              </span>
            )}
            {turn.stop_reason && (
              <Badge variant={turn.stop_reason === 'end_turn' ? 'success' : 'error'}>
                {turn.stop_reason}
              </Badge>
            )}
          </div>
        </CardHeader>

        {/* Scrollable content */}
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Quick metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Input Tokens"
              value={formatCompactNumber(turn.tokens.input)}
              detail={formatNumber(turn.tokens.input)}
              icon={<Zap className="h-4 w-4 text-purple-400" />}
              color="purple"
            />
            <MetricCard
              label="Output Tokens"
              value={formatCompactNumber(turn.tokens.output)}
              detail={formatNumber(turn.tokens.output)}
              icon={<Zap className="h-4 w-4 text-green-400" />}
              color="green"
            />
            <MetricCard
              label="Cache Hit"
              value={formatCompactNumber(turn.tokens.cache_read)}
              detail={`Write: ${formatCompactNumber(turn.tokens.cache_write)}`}
              icon={<Database className="h-4 w-4 text-blue-400" />}
              color="blue"
            />
            <MetricCard
              label="Cost"
              value={formatCurrency(turn.cost)}
              detail={`${turn.tool_count} tools used`}
              icon={<DollarSign className="h-4 w-4 text-yellow-400" />}
              color="yellow"
            />
          </div>

          {/* Token Breakdown Section */}
          <CollapsibleSection
            title="Token Breakdown"
            icon={<Zap className="h-4 w-4" />}
            isExpanded={expandedSections.has('tokens')}
            onToggle={() => toggleSection('tokens')}
          >
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <TokenBreakdownItem label="Input" value={turn.tokens.input} color="purple" />
              <TokenBreakdownItem label="Output" value={turn.tokens.output} color="green" />
              <TokenBreakdownItem label="Cache Read" value={turn.tokens.cache_read} color="blue" />
              <TokenBreakdownItem label="Cache Write" value={turn.tokens.cache_write} color="orange" />
              <TokenBreakdownItem label="Total" value={turn.tokens.total} color="white" isTotal />
            </div>
            {/* Cache efficiency bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Cache Efficiency</span>
                <span>
                  {turn.tokens.input > 0
                    ? ((turn.tokens.cache_read / turn.tokens.input) * 100).toFixed(1)
                    : 0}
                  % hit rate
                </span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-green-500"
                  style={{
                    width: `${turn.tokens.input > 0 ? (turn.tokens.cache_read / turn.tokens.input) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Tools Used Section */}
          {turn.tools_used.length > 0 && (
            <CollapsibleSection
              title={`Tools Used (${turn.tool_count})`}
              icon={<Wrench className="h-4 w-4" />}
              isExpanded={expandedSections.has('tools')}
              onToggle={() => toggleSection('tools')}
            >
              <div className="flex flex-wrap gap-2">
                {turn.tools_used.map((tool, index) => (
                  <ToolBadge key={index} tool={tool} />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* User Message Section */}
          {turn.user_message && (
            <CollapsibleSection
              title="User Message"
              icon={<User className="h-4 w-4" />}
              isExpanded={expandedSections.has('user')}
              onToggle={() => toggleSection('user')}
              actions={
                <CopyButton
                  onClick={() => copyToClipboard(turn.user_message!, 'user')}
                  copied={copiedField === 'user'}
                />
              }
            >
              <div className="rounded-lg bg-gray-800/50 p-4 max-h-60 overflow-y-auto">
                <MarkdownContent content={turn.user_message} />
              </div>
            </CollapsibleSection>
          )}

          {/* Assistant Response Section */}
          {turn.assistant_message && (
            <CollapsibleSection
              title="Assistant Response"
              icon={<MessageSquare className="h-4 w-4" />}
              isExpanded={expandedSections.has('assistant')}
              onToggle={() => toggleSection('assistant')}
              actions={
                <CopyButton
                  onClick={() => copyToClipboard(turn.assistant_message!, 'assistant')}
                  copied={copiedField === 'assistant'}
                />
              }
            >
              <div className="rounded-lg bg-gray-800/50 p-4 max-h-96 overflow-y-auto">
                <MarkdownContent content={turn.assistant_message} />
              </div>
            </CollapsibleSection>
          )}
        </CardContent>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-700 px-4 py-3 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>Total tokens: {formatNumber(turn.tokens.total)}</span>
            <span>Cost: {formatCurrency(turn.cost)}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon,
  isExpanded,
  onToggle,
  actions,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/30">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          {icon}
          {title}
        </div>
        {actions && (
          <div onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </button>
      {isExpanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// Metric Card Component
interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
  color: 'purple' | 'green' | 'blue' | 'yellow' | 'orange';
}

const metricColorStyles: Record<MetricCardProps['color'], string> = {
  purple: 'border-purple-800/50 bg-purple-900/20',
  green: 'border-green-800/50 bg-green-900/20',
  blue: 'border-blue-800/50 bg-blue-900/20',
  yellow: 'border-yellow-800/50 bg-yellow-900/20',
  orange: 'border-orange-800/50 bg-orange-900/20',
};

function MetricCard({ label, value, detail, icon, color }: MetricCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 flex flex-col',
        metricColorStyles[color]
      )}
    >
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold text-white">{value}</div>
      {detail && <div className="text-xs text-gray-500 mt-1">{detail}</div>}
    </div>
  );
}

// Token Breakdown Item
interface TokenBreakdownItemProps {
  label: string;
  value: number;
  color: 'purple' | 'green' | 'blue' | 'orange' | 'white';
  isTotal?: boolean;
}

const tokenColorStyles: Record<TokenBreakdownItemProps['color'], string> = {
  purple: 'text-purple-400',
  green: 'text-green-400',
  blue: 'text-blue-400',
  orange: 'text-orange-400',
  white: 'text-white',
};

function TokenBreakdownItem({ label, value, color, isTotal }: TokenBreakdownItemProps) {
  return (
    <div className={cn('text-center p-2 rounded', isTotal && 'bg-gray-700/30')}>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={cn('text-lg font-mono font-semibold', tokenColorStyles[color])}>
        {formatCompactNumber(value)}
      </div>
      <div className="text-xs text-gray-500">{formatNumber(value)}</div>
    </div>
  );
}

// Tool Badge Component
interface ToolBadgeProps {
  tool: string;
}

const toolColors: Record<string, { bg: string; text: string; border: string }> = {
  Read: { bg: 'bg-blue-900/30', text: 'text-blue-400', border: 'border-blue-800/50' },
  Write: { bg: 'bg-green-900/30', text: 'text-green-400', border: 'border-green-800/50' },
  Edit: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', border: 'border-yellow-800/50' },
  Bash: { bg: 'bg-purple-900/30', text: 'text-purple-400', border: 'border-purple-800/50' },
  Glob: { bg: 'bg-cyan-900/30', text: 'text-cyan-400', border: 'border-cyan-800/50' },
  Grep: { bg: 'bg-pink-900/30', text: 'text-pink-400', border: 'border-pink-800/50' },
  Task: { bg: 'bg-orange-900/30', text: 'text-orange-400', border: 'border-orange-800/50' },
  WebFetch: { bg: 'bg-indigo-900/30', text: 'text-indigo-400', border: 'border-indigo-800/50' },
  WebSearch: { bg: 'bg-teal-900/30', text: 'text-teal-400', border: 'border-teal-800/50' },
};

function ToolBadge({ tool }: ToolBadgeProps) {
  const colors = toolColors[tool] || {
    bg: 'bg-gray-800/50',
    text: 'text-gray-300',
    border: 'border-gray-700',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium',
        colors.bg,
        colors.text,
        colors.border
      )}
    >
      <Wrench className="h-3 w-3" />
      {tool}
    </span>
  );
}

// Copy Button Component
interface CopyButtonProps {
  onClick: () => void;
  copied: boolean;
}

function CopyButton({ onClick, copied }: CopyButtonProps) {
  return (
    <button
      className={cn(
        'p-1.5 rounded hover:bg-gray-600/50 transition-colors',
        copied && 'text-green-400'
      )}
      onClick={onClick}
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 text-gray-400" />}
    </button>
  );
}

// Markdown Content with Syntax Highlighting
interface MarkdownContentProps {
  content: string;
}

function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match;

            if (isInline) {
              return (
                <code
                  className="bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-gray-200"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <SyntaxHighlighter
                style={vscDarkPlus}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0 text-gray-300">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc list-inside mb-2 text-gray-300">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside mb-2 text-gray-300">{children}</ol>;
          },
          li({ children }) {
            return <li className="mb-1">{children}</li>;
          },
          h1({ children }) {
            return <h1 className="text-xl font-bold mb-2 text-white">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-bold mb-2 text-white">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-bold mb-2 text-white">{children}</h3>;
          },
          a({ children, href }) {
            return (
              <a
                href={href}
                className="text-blue-400 hover:text-blue-300 underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-gray-600 pl-4 italic text-gray-400 my-2">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="min-w-full divide-y divide-gray-700">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider bg-gray-800">
                {children}
              </th>
            );
          },
          td({ children }) {
            return <td className="px-3 py-2 text-sm text-gray-300">{children}</td>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default TurnDetailView;
