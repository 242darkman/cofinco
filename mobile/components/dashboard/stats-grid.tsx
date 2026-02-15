import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/card';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface StatCardProps {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  trend?: 'up' | 'down' | 'neutral';
}

function StatCard({ label, value, icon, trend }: StatCardProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const trendColor =
    trend === 'up' ? colors.success : trend === 'down' ? colors.danger : colors.textMuted;

  return (
    <Card className="flex-1 min-w-[45%]">
      <View className="flex-row items-center justify-between mb-2">
        <View className="w-9 h-9 rounded-xl bg-accent/10 items-center justify-center">
          <Ionicons name={icon} size={18} color={colors.accent} />
        </View>
        {trend && (
          <Ionicons
            name={trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'remove'}
            size={16}
            color={trendColor}
          />
        )}
      </View>
      <Text className="text-text-primary text-xl font-bold" numberOfLines={1}>
        {value}
      </Text>
      <Text className="text-text-muted text-xs mt-0.5">{label}</Text>
    </Card>
  );
}

interface StatsGridProps {
  stats: {
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
    trend?: 'up' | 'down' | 'neutral';
  }[];
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {stats.map((stat, i) => (
        <StatCard key={i} {...stat} />
      ))}
    </View>
  );
}
