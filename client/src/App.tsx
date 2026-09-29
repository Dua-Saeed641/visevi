import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Compare } from './pages/Compare'
import { Dashboard } from './pages/Dashboard'
import { Graph } from './pages/Graph'
import { Report } from './pages/Report'
import { Timeline } from './pages/Timeline'
import { Upload } from './pages/Upload'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="compare" element={<Compare />} />
        <Route path="report" element={<Report />} />
        <Route path="timeline" element={<Timeline />} />
        <Route path="graph" element={<Graph />} />
        <Route path="upload" element={<Upload />} />
      </Route>
    </Routes>
  )
}

export default App
