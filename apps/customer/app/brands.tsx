import { useLocalSearchParams } from 'expo-router';
import { BrandsScreen } from '../src/screens/clothing/BrandsScreen';

/**
 * The brand directory for a department. `department` names which shop's brands
 * to list — clothing today, any trade with brands tomorrow.
 */
export default function BrandsRoute() {
  const { department } = useLocalSearchParams<{ department?: string }>();
  return <BrandsScreen department={department ?? 'clothing'} />;
}
