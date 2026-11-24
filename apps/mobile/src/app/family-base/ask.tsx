import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { ErrorText, Field, Row } from '@/components/form';
import { openBaseNode } from '@/components/family-base';
import { Mascot } from '@/components/mascot';
import { confirm, LinkRow, Page, queryState, WithFamily } from '@/components/screen';
import { Button, Card, Text } from '@/components/ui';
import { getApi, required } from '@/lib/api';
import { useBaseQuery } from '@/lib/base-query';
import { askExamples, askNotice, askStep, type AskAnswer } from '@/lib/family-ask';
import type { Family } from '@/lib/family';
import { singularLabels } from '@/lib/family-base';
import { useSave } from '@/lib/save';
import { useSignedIn } from '@/lib/session';

export default function AskScreen() { return <><Stack.Screen options={{ title: 'Ask Family Base' }} /><WithFamily>{(family) => <Ask key={family.id} family={family} />}</WithFamily></>; }

const Notice = () => <View style={{ gap: 6 }}>{askNotice.map((line) => <Text key={line}>{'• ' + line}</Text>)}</View>;

// Questions and answers stay in memory and are gone when the screen closes.
function Ask({ family }: { family: Family }) {
  const { access_token } = useSignedIn(), { busy, error, setError, save } = useSave(), path = { familyId: family.id };
  const [question, setQuestion] = useState(''), [adult, setAdult] = useState(false), [last, setLast] = useState<AskAnswer>(), open = useRef(true);
  useEffect(() => { open.current = true; return () => { open.current = false; }; }, []);
  const load = useCallback(async (signal: AbortSignal) => {
    const api = getApi(access_token), params = { path: { familyId: family.id } };
    const [status, graph] = await Promise.all([api.GET('/api/v1/families/{familyId}/base/ai', { params, signal }).then(required), api.GET('/api/v1/families/{familyId}/base/graph', { params, signal }).then(required)]);
    return { status, graph };
  }, [access_token, family.id]);
  const query = useBaseQuery(family.id, 'base-ask', load);
  const state = queryState(query, { loading: 'Checking…', failed: 'Questions couldn’t open', lost: 'Family Base unavailable' });
  if (state || !query.data) return state;
  const { status, graph } = query.data, step = askStep(status);
  const setEnabled = async (enabled: boolean) => {
    const result = await save(() => getApi(access_token).PUT('/api/v1/families/{familyId}/base/ai/settings', { params: { path }, body: { enabled } }), 'We couldn’t save this. Try again.');
    if (result.ok) query.replace((old) => ({ ...old, status: result.data }));
    if (result.ok && !enabled) setLast(undefined);
  };
  const setConsent = async (accepted: boolean) => {
    const result = await save(() => getApi(access_token).PUT('/api/v1/families/{familyId}/base/ai/consent', { params: { path }, body: { accepted, adult } }), 'We couldn’t save this. Try again.');
    if (result.ok) query.replace((old) => ({ ...old, status: result.data }));
    if (result.ok && !accepted) { setLast(undefined); setAdult(false); }
  };
  async function ask() {
    const asked = question.trim();
    if (asked.length < 3) return setError('Enter a question of 3 characters or more.');
    const result = await save(() => getApi(access_token).POST('/api/v1/families/{familyId}/base/ai/questions', { params: { path }, body: { question: asked } }), 'We couldn’t get an answer. Try again.');
    if (!open.current) return;
    if (!result.ok) return query.refresh();
    setLast({ question: asked, answer: result.data.answer, nodeIds: result.data.nodeIds });
    query.replace((old) => ({ ...old, status: { ...old.status, remaining: result.data.remaining } }));
    setQuestion('');
  }
  const sources = (last?.nodeIds ?? []).flatMap((id) => graph.nodes.find((node) => node.id === id) ?? []);
  return (
    <Page query={query}>
      <View style={{ alignItems: 'center' }}><Mascot size={110} mood={busy ? 'think' : 'wave'} /></View>
      <Text muted>Answers come only from records you can already see.</Text>
      {step === 'unavailable' && <Card><Text>Questions aren’t set up on this server yet.</Text></Card>}
      {step === 'off' && <Card>{status.canManage ? <><Text>Questions are off for this family. As the owner, you can turn them on. Each adult then decides for themselves before their first question.</Text><Notice /><Button title="Turn on for this family" busy={busy} onPress={() => void setEnabled(true)} /></> : <Text>Questions are off. Your family owner can turn them on here.</Text>}</Card>}
      {step === 'consent' && <Card><Text weight="600" accessibilityRole="header">Before your first question</Text><Notice /><Row multiple title="I am 18 or older and agree to this." selected={adult} onPress={() => setAdult(!adult)} /><Button title="Agree and continue" busy={busy} disabled={!adult} onPress={() => void setConsent(true)} /></Card>}
      {step === 'ready' && <>
        {last && <Card accessibilityLiveRegion="polite"><Text weight="600">{last.question}</Text><Text selectable>{last.answer}</Text>
          {sources.map((node) => <LinkRow key={node.id} icon="link-outline" title={node.name} note={singularLabels[node.kind]} onPress={() => openBaseNode(node)} />)}
          <Text muted size={13}>Written by AI. Check the records before relying on it.</Text></Card>}
        <Field label="Your question" value={question} maxLength={500} multiline editable={!busy && status.remaining > 0} onChangeText={setQuestion} />
        {!last && askExamples.map((example) => <Button key={example} variant="outline" title={example} disabled={busy} onPress={() => setQuestion(example)} />)}
        <Text muted size={13} accessibilityLiveRegion="polite">{busy ? 'Looking through your records…' : status.remaining + (status.remaining === 1 ? ' question' : ' questions') + ' left today'}</Text>
        <Button title={busy ? 'Asking…' : 'Ask'} busy={busy} disabled={status.remaining === 0 || question.trim().length < 3} onPress={() => void ask()} />
      </>}
      <ErrorText>{error}</ErrorText>
      {step === 'ready' && <Button variant="outline" title="Withdraw my consent" disabled={busy} onPress={() => confirm('Withdraw your consent?', 'You can’t ask questions until you agree again.', 'Withdraw', () => void setConsent(false))} />}
      {status.enabled && status.canManage && <Button variant="outline" title="Turn off for family" disabled={busy} onPress={() => confirm('Turn off questions?', 'Nobody in this family can ask until you turn them on again.', 'Turn off', () => void setEnabled(false))} />}
      <Button variant="outline" title="Back to Family Base" disabled={busy} onPress={() => router.back()} />
    </Page>
  );
}
