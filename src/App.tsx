import { BrowserRouter } from 'react-router-dom';
import { AppProviders } from '@/context/AppProviders';
import { AppRoutes } from '@/routes/AppRoutes';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

const App = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
