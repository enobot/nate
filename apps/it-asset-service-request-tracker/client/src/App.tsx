import { Link, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { PageHeader } from './components/ui'
import { ActorProvider } from './context/ActorContext'
import { AboutPage } from './pages/AboutPage'
import { AssetDetailPage } from './pages/AssetDetailPage'
import { AssetFormPage } from './pages/AssetFormPage'
import { AssetsPage } from './pages/AssetsPage'
import { DashboardPage } from './pages/DashboardPage'
import { DirectoryPage } from './pages/DirectoryPage'
import { NetworkPage } from './pages/NetworkPage'
import { ReportsPage } from './pages/ReportsPage'
import { ServiceRequestDetailPage } from './pages/ServiceRequestDetailPage'
import { ServiceRequestFormPage } from './pages/ServiceRequestFormPage'
import { ServiceRequestsPage } from './pages/ServiceRequestsPage'
import { SwitchDetailPage } from './pages/SwitchDetailPage'

function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" description="That address does not match any page in the tracker." />
      <Link to="/" className="text-sky-300 underline">
        Back to the dashboard
      </Link>
    </>
  )
}

export default function App() {
  return (
    <ActorProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/assets/new" element={<AssetFormPage />} />
          <Route path="/assets/:id" element={<AssetDetailPage />} />
          <Route path="/assets/:id/edit" element={<AssetFormPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/network/switches/:id" element={<SwitchDetailPage />} />
          <Route path="/requests" element={<ServiceRequestsPage />} />
          <Route path="/requests/new" element={<ServiceRequestFormPage />} />
          <Route path="/requests/:id" element={<ServiceRequestDetailPage />} />
          <Route path="/requests/:id/edit" element={<ServiceRequestFormPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </ActorProvider>
  )
}
