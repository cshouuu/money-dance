import { ChoiceCard, ChoiceGroup } from '../../ui/BeuiControls'
import { SPACE_TEMPLATES, type SpaceTemplate } from '../../lib/workspaces/model'
import './Workspaces.css'

export function TemplateSelector({ value, onChange }: { value: SpaceTemplate; onChange: (value: SpaceTemplate) => void }) {
  return <ChoiceGroup className="workspace-templates" legend="选择适合这份工作的方式" value={value} onValueChange={value => onChange(value as SpaceTemplate)}>
    {SPACE_TEMPLATES.map(template => <ChoiceCard key={template.id} value={template.id} title={template.name} description={template.description}/>)}
  </ChoiceGroup>
}
