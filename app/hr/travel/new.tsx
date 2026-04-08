import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedView } from '@/components/themed-view';
import { HrBottomNav } from '@/components/HrBottomNav';
import { useHrAuth } from '@/context/HrAuthContext';
import {
  createTravelRequest,
  getTravelRequestByRequestId,
  listL1Approvers,
  listProjects,
  updateTravelRequest,
  type LocalAttachment,
  type UploadedAttachment,
} from '@/lib/hr/travelRequests';

type FormData = {
  paymentType: '' | 'advance' | 'reimbursement';
  activityName: string;
  projectName: string;
  projectId: string;
  l1ApproverId: string;
  travelType: string;
  origin: string;
  destination: string;
  dateTimeFrom: string;
  dateTimeTo: string;
  currency: string;
  expenseBreakdown: Array<{
    id: string;
    purpose: string;
    description?: string;
    quantity: number;
    unitCost: number;
    subtotal: number;
  }>;
  totalAmount: number;
  paymentMethod: '' | 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque';
  bankDetails: null | { accountNumber: string; bankName: string; branch: string; swiftCode?: string };
  mobileNumber: string;
  hasBankDetailsOnFile: boolean;
  attachments: LocalAttachment[];
  comments: string;
};

const TOTAL_STEPS = 4;

export default function HrNewTravelRequestScreen() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editRequestId = typeof edit === 'string' && edit.trim() ? edit.trim() : null;
  const isEditMode = !!editRequestId;

  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<string>('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);
  const [showSubmittedModal, setShowSubmittedModal] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [existingUploads, setExistingUploads] = useState<UploadedAttachment[]>([]);

  const [projects, setProjects] = useState<Array<{ $id: string; name?: string | null; projectID?: string | null }>>(
    [],
  );
  const [approvers, setApprovers] = useState<Array<{ userId: string; name: string; department?: string | null }>>(
    [],
  );

  const [formData, setFormData] = useState<FormData>({
    paymentType: '',
    activityName: '',
    projectName: '',
    projectId: '',
    l1ApproverId: '',
    travelType: '',
    origin: '',
    destination: '',
    dateTimeFrom: '',
    dateTimeTo: '',
    currency: '',
    expenseBreakdown: [],
    totalAmount: 0,
    paymentMethod: '',
    bankDetails: null,
    mobileNumber: '',
    hasBankDetailsOnFile: false,
    attachments: [],
    comments: '',
  });

  const downloadSubmittedRequest = useCallback(async () => {
    if (!submittedRequestId) return;
    try {
      const doc = await getTravelRequestByRequestId(submittedRequestId);
      if (!doc) throw new Error('Request not found.');

      const expense = Array.isArray((doc as any).expenseBreakdown) ? (doc as any).expenseBreakdown : [];
      const totalAmount = (doc as any).totalAmount ?? '';
      const currency = (doc as any).currency ?? '';

      const safe = (v: any) => String(v ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 20px; color: #0f172a; }
      .brand { background: linear-gradient(90deg, #054653, #0e706d, #FFB803); border-radius: 14px; padding: 14px 16px; color: white; }
      .title { font-size: 18px; font-weight: 800; margin: 0; }
      .sub { font-size: 12px; opacity: 0.92; margin: 6px 0 0; }
      .card { margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; }
      .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid #f3f4f6; }
      .row:first-child { border-top: 0; }
      .k { font-size: 11px; color: #6b7280; font-weight: 700; }
      .v { font-size: 12px; color: #0f172a; font-weight: 700; text-align: right; }
      .muted { color: #6b7280; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border-top: 1px solid #f3f4f6; padding: 10px 0; font-size: 12px; }
      th { text-align: left; color: #6b7280; font-weight: 800; }
      td:last-child { text-align: right; font-weight: 800; }
    </style>
  </head>
  <body>
    <div class="brand">
      <p class="title">Travel Request</p>
      <p class="sub">Request ID: ${safe((doc as any).requestId || submittedRequestId)}</p>
    </div>

    <div class="card">
      <div class="row"><div class="k">Destination</div><div class="v">${safe((doc as any).destination || '')}</div></div>
      <div class="row"><div class="k">Origin</div><div class="v">${safe((doc as any).origin || '')}</div></div>
      <div class="row"><div class="k">Activity</div><div class="v">${safe((doc as any).activityName || '')}</div></div>
      <div class="row"><div class="k">Travel type</div><div class="v">${safe((doc as any).travelType || '')}</div></div>
      <div class="row"><div class="k">From</div><div class="v">${safe((doc as any).dateTimeFrom || '')}</div></div>
      <div class="row"><div class="k">To</div><div class="v">${safe((doc as any).dateTimeTo || '')}</div></div>
      <div class="row"><div class="k">Status</div><div class="v">${safe((doc as any).status || '')}</div></div>
    </div>

    <div class="card">
      <div class="row"><div class="k">Total</div><div class="v">${safe(currency)} ${safe(totalAmount)}</div></div>
      <div class="row"><div class="k">Payment method</div><div class="v">${safe((doc as any).paymentMethod || '')}</div></div>
      <div class="row"><div class="k">Payment type</div><div class="v">${safe((doc as any).paymentType || '')}</div></div>
      <div class="row"><div class="k">Comments</div><div class="v muted">${safe((doc as any).comments || '—')}</div></div>

      <table>
        <thead>
          <tr><th>Expense</th><th>Subtotal</th></tr>
        </thead>
        <tbody>
          ${
            expense.length
              ? expense
                  .map((e: any) => {
                    const purpose = safe(e?.purpose || 'Item');
                    const subtotal = safe(e?.subtotal ?? '');
                    return `<tr><td>${purpose}</td><td>${safe(currency)} ${subtotal}</td></tr>`;
                  })
                  .join('')
              : `<tr><td class="muted">No expense items</td><td class="muted">—</td></tr>`
          }
        </tbody>
      </table>
    </div>
  </body>
</html>`;

      try {
        const file = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            UTI: 'com.adobe.pdf',
            mimeType: 'application/pdf',
            dialogTitle: `Travel Request ${submittedRequestId}`,
          } as any);
        } else {
          Alert.alert('Saved', `PDF generated at:\n${file.uri}`);
        }
      } catch (pdfErr: any) {
        // Some Expo Go / device setups can fail to render PDFs. Fall back to sharing HTML.
        const base = (FileSystem.documentDirectory || FileSystem.cacheDirectory || '').toString();
        const htmlPath = `${base}travel_request_${encodeURIComponent(submittedRequestId)}.html`;
        await FileSystem.writeAsStringAsync(htmlPath, html, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(htmlPath, {
            mimeType: 'text/html',
            dialogTitle: `Travel Request ${submittedRequestId}`,
          } as any);
        } else {
          Alert.alert('Saved', `File generated at:\n${htmlPath}\n\nPDF export failed: ${pdfErr?.message || 'Unknown error'}`);
        }
      }
    } catch (e: any) {
      Alert.alert('Download failed', e?.message || 'Unable to download this request.');
    }
  }, [submittedRequestId]);

  const fs: any = FileSystem as any;
  const draftPath = useMemo(() => {
    const base = fs.documentDirectory || fs.cacheDirectory || '';
    const id = user?.$id || 'anon';
    const suffix = editRequestId ? `_edit_${encodeURIComponent(editRequestId)}` : '';
    return `${base}travel_request_draft_${id}${suffix}.json`;
  }, [editRequestId, fs, user?.$id]);

  const saveDraftTimer = useRef<any>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/hr');
  }, [isLoading, user, router]);

  const loadBootData = useCallback(async () => {
    if (!user?.$id) return;
    setInitialLoading(true);
    try {
      const [p, a] = await Promise.all([listProjects(), listL1Approvers(user.$id)]);
      setProjects(p);
      setApprovers(a);

      try {
        const info = await FileSystem.getInfoAsync(draftPath);
        if (info.exists) {
          const json = await FileSystem.readAsStringAsync(draftPath);
          const parsed = JSON.parse(json);
          setFormData((prev) => ({ ...prev, ...parsed }));
        }
      } catch {
        // ignore draft load errors
      }

      if (editRequestId) {
        const req = await getTravelRequestByRequestId(editRequestId);

        if (req.userId !== user.$id) {
          throw new Error("You don't have permission to edit this travel request.");
        }

        const status = String(req.status || '').toLowerCase();
        if (!(status === 'pending' || status === 'rejected')) {
          throw new Error(`This travel request cannot be edited because it has status: ${statusLabel(req.status)}`);
        }

        setEditingDocId(String(req.$id));
        setExistingUploads(Array.isArray(req.attachments) ? (req.attachments as any) : []);
        setFormData((prev) => ({
          ...prev,
          paymentType: (req.paymentType || '') as any,
          activityName: req.activityName || '',
          projectName: req.projectName || '',
          projectId: req.projectId || '',
          l1ApproverId: req.l1ApproverId || '',
          travelType: req.travelType || '',
          origin: req.origin || '',
          destination: req.destination || '',
          dateTimeFrom: req.dateTimeFrom || '',
          dateTimeTo: req.dateTimeTo || '',
          currency: req.currency || '',
          expenseBreakdown: Array.isArray(req.expenseBreakdown) ? req.expenseBreakdown : [],
          totalAmount: Number(req.totalAmount || 0),
          paymentMethod: (req.paymentMethod || '') as any,
          bankDetails: req.bankDetails || null,
          mobileNumber: req.mobileNumber || '',
          hasBankDetailsOnFile: !!req.hasBankDetailsOnFile,
          // For edits we keep existing uploads separately; attachments here are new picks only
          attachments: [],
          comments: req.comments || '',
        }));
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load form data');
    } finally {
      setInitialLoading(false);
    }
  }, [draftPath, editRequestId, user?.$id]);

  useEffect(() => {
    if (!isLoading && user?.$id) loadBootData();
  }, [isLoading, user?.$id, loadBootData]);

  useEffect(() => {
    if (!user?.$id) return;
    if (initialLoading) return;
    if (saveDraftTimer.current) clearTimeout(saveDraftTimer.current);
    saveDraftTimer.current = setTimeout(async () => {
      try {
        await FileSystem.writeAsStringAsync(draftPath, JSON.stringify(formData), {
          // leave encoding default to avoid type issues
        });
      } catch {
        // ignore draft save errors
      }
    }, 400);
    return () => {
      if (saveDraftTimer.current) clearTimeout(saveDraftTimer.current);
    };
  }, [draftPath, formData, initialLoading, user?.$id]);

  const progress = (currentStep / TOTAL_STEPS) * 100;
  const stepTitle =
    currentStep === 1 ? 'Trip Details'
    : currentStep === 2 ? 'Funding, Expenses & Payment Method'
    : currentStep === 3 ? 'Supporting Attachments & Comments'
    : 'Review & Submit';

  const totalAmount = useMemo(() => {
    return (formData.expenseBreakdown || []).reduce((sum, e) => sum + (Number(e.subtotal) || 0), 0);
  }, [formData.expenseBreakdown]);

  useEffect(() => {
    if (formData.totalAmount !== totalAmount) {
      setFormData((p) => ({ ...p, totalAmount }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAmount]);

  const goNext = () => {
    setError(null);
    const err = validateStep(currentStep, formData);
    if (err) {
      setError(err);
      return;
    }
    setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };
  const goBack = () => {
    setError(null);
    setCurrentStep((s) => Math.max(1, s - 1));
  };

  const submit = async () => {
    if (!user?.$id) return;
    const err = validateStep(4, formData);
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    setSubmitStage(isEditMode ? 'Saving your changes…' : 'Submitting your request…');
    try {
      const userName = user.name || user.email || 'Unknown User';
      if (isEditMode && formData.attachments.length > 0) {
        setSubmitStage(`Uploading ${formData.attachments.length} attachment(s)…`);
      }
      const result = isEditMode
        ? await updateTravelRequest({
            documentId: String(editingDocId || ''),
            requestId: String(editRequestId || ''),
            userId: user.$id,
            existingUploads,
            newAttachments: formData.attachments,
            formData: {
              paymentType: formData.paymentType as any,
              activityName: formData.activityName,
              projectName: formData.projectName,
              projectId: formData.projectId,
              l1ApproverId: formData.l1ApproverId,
              travelType: formData.travelType,
              origin: formData.origin,
              destination: formData.destination,
              dateTimeFrom: formData.dateTimeFrom,
              dateTimeTo: formData.dateTimeTo,
              currency: formData.currency,
              expenseBreakdown: formData.expenseBreakdown,
              totalAmount: formData.totalAmount,
              paymentMethod: formData.paymentMethod as any,
              bankDetails: formData.bankDetails,
              mobileNumber: formData.mobileNumber,
              hasBankDetailsOnFile: formData.hasBankDetailsOnFile,
              comments: formData.comments,
            },
          })
        : await createTravelRequest({
            userId: user.$id,
            userName,
            paymentType: formData.paymentType as any,
            activityName: formData.activityName,
            projectName: formData.projectName,
            projectId: formData.projectId,
            l1ApproverId: formData.l1ApproverId,
            travelType: formData.travelType,
            origin: formData.origin,
            destination: formData.destination,
            dateTimeFrom: formData.dateTimeFrom,
            dateTimeTo: formData.dateTimeTo,
            currency: formData.currency,
            expenseBreakdown: formData.expenseBreakdown,
            totalAmount: formData.totalAmount,
            paymentMethod: formData.paymentMethod as any,
            hasBankDetailsOnFile: formData.hasBankDetailsOnFile,
            bankDetails: formData.bankDetails,
            mobileNumber: formData.mobileNumber,
            comments: formData.comments,
            attachments: formData.attachments,
          });
      setSubmitStage('Finalizing…');
      try {
        await FileSystem.deleteAsync(draftPath, { idempotent: true });
      } catch {
        // ignore
      }
      setSubmittedRequestId(isEditMode ? String(editRequestId) : (result as any).requestId);
      setShowSubmittedModal(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to submit travel request');
    } finally {
      setSubmitting(false);
      setSubmitStage('');
    }
  };

  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/jpeg',
          'image/jpg',
          'image/png',
        ],
      });
      if (result.canceled) return;
      const assets = result.assets || [];
      const maxSize = 20 * 1024 * 1024;

      const next: LocalAttachment[] = [];
      for (const a of assets) {
        if (!a.uri || !a.name) continue;
        const size = Number(a.size || 0);
        if (size > maxSize) {
          Alert.alert('File too large', `${a.name} exceeds 20MB.`);
          continue;
        }
        next.push({
          id: `${Date.now()}_${Math.random()}`,
          uri: a.uri,
          name: a.name,
          mimeType: a.mimeType || guessMimeFromName(a.name),
          size,
        });
      }
      if (next.length > 0) {
        setFormData((p) => ({ ...p, attachments: [...(p.attachments || []), ...next] }));
      }
    } catch (e: any) {
      Alert.alert('Picker error', e?.message || 'Failed to pick files');
    }
  };

  if (isLoading || !user) return null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(16, insets.top + 12) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>
            {isEditMode && editRequestId ? `Edit Travel Request: ${editRequestId}` : 'Travel Request / Advance Form'}
          </Text>
          <Text style={styles.headerSub}>
            {isEditMode
              ? 'Make changes to your travel request. Editing will reset approval status to pending.'
              : 'Please fill out all required information to submit your travel request.'}
          </Text>

          <View style={styles.progressOuter}>
            <View style={[styles.progressInner, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>
            Step {currentStep} of {TOTAL_STEPS}: {stepTitle}
          </Text>

          <View style={styles.stepDotsRow}>
            {[1, 2, 3, 4].map((s) => (
              <View
                key={s}
                style={[
                  styles.stepDot,
                  s === currentStep ? styles.stepDotActive : s < currentStep ? styles.stepDotDone : null,
                ]}
              >
                <Text
                  style={[
                    styles.stepDotText,
                    s === currentStep ? styles.stepDotTextActive : s < currentStep ? styles.stepDotTextDone : null,
                  ]}
                >
                  {s}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {isEditMode ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Important</Text>
            <Text style={styles.warningText}>
              Editing this request will reset its status to “Pending” and it will need to go through the approval
              process again.
            </Text>
          </View>
        ) : null}

        {initialLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#054653" />
          </View>
        ) : (
          <>
            {currentStep === 1 ? (
              <TripDetailsStep
                data={formData}
                projects={projects}
                approvers={approvers}
                onChange={setFormData}
              />
            ) : null}
            {currentStep === 2 ? <FundingExpensesStep data={formData} onChange={setFormData} /> : null}
            {currentStep === 3 ? (
              <AttachmentsStep
                data={formData}
                existingUploads={existingUploads}
                onRemoveExisting={(idx) =>
                  setExistingUploads((prev) => prev.filter((_, i) => i !== idx))
                }
                onChange={setFormData}
                onPickFiles={pickFiles}
                isEditMode={isEditMode}
              />
            ) : null}
            {currentStep === 4 ? <ReviewStep data={formData} /> : null}

            <View style={styles.navRow}>
              <View style={{ flex: 1 }}>
                {currentStep > 1 ? (
                  <Pressable onPress={goBack} style={[styles.navBtn, styles.navBtnOutline]}>
                    <Text style={[styles.navBtnText, styles.navBtnTextOutline]}>
                      Back: {currentStep === 2 ? 'Trip Details' : currentStep === 3 ? 'Funding & Expenses' : 'Attachments'}
                    </Text>
                  </Pressable>
                ) : (
                  <View />
                )}
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                {currentStep < 4 ? (
                  <Pressable onPress={goNext} style={styles.navBtn}>
                    <Text style={styles.navBtnText}>
                      Next:{' '}
                      {currentStep === 1 ? 'Funding & Expenses' : currentStep === 2 ? 'Attachments' : 'Review & Submit'}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={submit} style={[styles.navBtn, submitting && { opacity: 0.7 }]} disabled={submitting}>
                    <Text style={styles.navBtnText}>
                      {submitting ? (submitStage ? submitStage : 'Submitting…') : 'Submit Travel Request'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
      <HrBottomNav />

      <Modal
        visible={showSubmittedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSubmittedModal(false)}
      >
        <View style={styles.submittedBackdrop}>
          <View style={styles.submittedCard}>
            <View style={styles.submittedIconWrap}>
              <MaterialCommunityIcons name="check-decagram" size={26} color="#054653" />
            </View>
            <Text style={styles.submittedTitle}>{isEditMode ? 'Updated Successfully' : 'Submitted Successfully'}</Text>
            <Text style={styles.submittedSub}>
              {isEditMode ? 'Your travel request has been updated.' : 'Your travel request has been submitted.'}
            </Text>

            {submittedRequestId ? (
              <View style={styles.submittedIdPill}>
                <Text style={styles.submittedIdLabel}>Request ID</Text>
                <Text style={styles.submittedIdValue}>{submittedRequestId}</Text>
              </View>
            ) : null}

            <View style={styles.submittedActions}>
              <Pressable
                onPress={() => {
                  setShowSubmittedModal(false);
                  router.replace(isEditMode && submittedRequestId ? (`/hr/travel/${submittedRequestId}` as any) : '/hr/travel');
                }}
                style={[styles.submittedBtn, styles.submittedBtnPrimary]}
              >
                <Text style={styles.submittedBtnTextPrimary}>
                  {isEditMode ? 'Back to Request' : 'Back to Travel Requests'}
                </Text>
              </Pressable>

              {submittedRequestId && !isEditMode ? (
                <Pressable
                  onPress={() => {
                    downloadSubmittedRequest();
                  }}
                  style={[styles.submittedBtn, styles.submittedBtnGradient]}
                >
                  <LinearGradient
                    colors={['#054653', '#0e706d', '#FFB803']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.submittedBtnGradientInner}
                  >
                    <Text style={styles.submittedBtnTextPrimary}>Download Travel Request</Text>
                  </LinearGradient>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

function TripDetailsStep({
  data,
  projects,
  approvers,
  onChange,
}: {
  data: FormData;
  projects: Array<{ $id: string; name?: string | null; projectID?: string | null }>;
  approvers: Array<{ userId: string; name: string; department?: string | null }>;
  onChange: React.Dispatch<React.SetStateAction<FormData>>;
}) {
  const [projectModal, setProjectModal] = useState(false);
  const [approverModal, setApproverModal] = useState(false);
  const [travelTypeModal, setTravelTypeModal] = useState(false);
  const [customProjectName, setCustomProjectName] = useState('');
  const [iosPickerField, setIosPickerField] = useState<null | 'dateTimeFrom' | 'dateTimeTo'>(null);
  const [iosPickerValue, setIosPickerValue] = useState<Date>(new Date());

  const travelTypes = [
    'Local',
    'International',
    'Field-Trip',
    'Conference',
    'Training',
    'Workshop',
    'Other',
  ];

  const openDateTime = (field: 'dateTimeFrom' | 'dateTimeTo') => {
    const current = field === 'dateTimeFrom' ? data.dateTimeFrom : data.dateTimeTo;
    const value = current ? new Date(current) : new Date();
    if (Platform.OS === 'android') {
      // Android: pick DATE first, then TIME. This matches the web “datetime-local” behavior.
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        display: 'spinner',
        onChange: (event: any, pickedDate?: Date) => {
          if (event?.type === 'dismissed') return;
          const base = pickedDate ? new Date(pickedDate) : new Date(value);
          // keep existing time if present
          const existing = current ? new Date(current) : new Date();
          base.setHours(existing.getHours(), existing.getMinutes(), 0, 0);

          DateTimePickerAndroid.open({
            value: base,
            mode: 'time',
            is24Hour: false,
            display: 'spinner',
            onChange: (event2: any, pickedTime?: Date) => {
              if (event2?.type === 'dismissed') return;
              const finalDt = new Date(base);
              if (pickedTime) {
                finalDt.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
              }
              onChange((p) => ({ ...p, [field]: finalDt.toISOString() } as any));
            },
          });
        },
      });
      return;
    }

    // iOS: show an in-app modal datetime picker.
    setIosPickerField(field);
    setIosPickerValue(value);
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.stepCard}>
        <Text style={styles.stepTitle}>Trip Details</Text>
        <Text style={styles.stepSub}>
          Please provide the basic information about your travel request.
        </Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Type of Payment *</Text>
        <View style={styles.radioRow}>
          <Radio
            label="Advance"
            active={data.paymentType === 'advance'}
            onPress={() => onChange((p) => ({ ...p, paymentType: 'advance' }))}
          />
          <Radio
            label="Reimbursement"
            active={data.paymentType === 'reimbursement'}
            onPress={() => onChange((p) => ({ ...p, paymentType: 'reimbursement' }))}
          />
        </View>

        <Field
          label="Activity Name *"
          value={data.activityName}
          onChangeText={(v) => onChange((p) => ({ ...p, activityName: v }))}
          placeholder="Enter the name of the activity you're traveling for"
        />

        <Text style={styles.label}>Project *</Text>
        <Pressable onPress={() => setProjectModal(true)} style={styles.selectBtn}>
          <Text style={styles.selectBtnText}>
            {data.projectId ? projectLabel(projects, data.projectId, data.projectName) : 'Select a project'}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={20} color="#6b7280" />
        </Pressable>
        {data.projectId === 'N/A' ? (
          <TextInput
            value={customProjectName}
            onChangeText={(v) => {
              setCustomProjectName(v);
              onChange((p) => ({ ...p, projectId: 'N/A', projectName: v }));
            }}
            placeholder="Enter custom project name"
            placeholderTextColor="#9ca3af"
            style={styles.input}
          />
        ) : null}

        <Text style={styles.label}>Level 1 Approver *</Text>
        <Pressable onPress={() => setApproverModal(true)} style={styles.selectBtn}>
          <Text style={styles.selectBtnText}>
            {data.l1ApproverId ? approverLabel(approvers, data.l1ApproverId) : 'Select an approver'}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={20} color="#6b7280" />
        </Pressable>

        <Text style={styles.label}>Type of Travel *</Text>
        <Pressable onPress={() => setTravelTypeModal(true)} style={styles.selectBtn}>
          <Text style={styles.selectBtnText}>{data.travelType || 'Select travel type'}</Text>
          <MaterialCommunityIcons name="chevron-down" size={20} color="#6b7280" />
        </Pressable>

        <View style={styles.twoColRow}>
          <View style={{ flex: 1 }}>
            <Field
              label="Origin (Place) *"
              value={data.origin}
              onChangeText={(v) => onChange((p) => ({ ...p, origin: v }))}
              placeholder="Where are you traveling from?"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Destination (Place) *"
              value={data.destination}
              onChangeText={(v) => onChange((p) => ({ ...p, destination: v }))}
              placeholder="Where are you traveling to?"
            />
          </View>
        </View>

        <View style={styles.twoColRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Date & Time From *</Text>
            <Pressable
              onPress={() => openDateTime('dateTimeFrom')}
              style={styles.selectBtn}
            >
              <Text style={styles.selectBtnText}>
                {data.dateTimeFrom ? formatDateTime12(data.dateTimeFrom) : 'Select start date/time'}
              </Text>
              <MaterialCommunityIcons name="calendar" size={18} color="#6b7280" />
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Date & Time To *</Text>
            <Pressable
              onPress={() => openDateTime('dateTimeTo')}
              style={styles.selectBtn}
            >
              <Text style={styles.selectBtnText}>
                {data.dateTimeTo ? formatDateTime12(data.dateTimeTo) : 'Select end date/time'}
              </Text>
              <MaterialCommunityIcons name="calendar" size={18} color="#6b7280" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* iOS modal picker (Android uses native dialogs above) */}
      <Modal
        visible={Platform.OS === 'ios' && iosPickerField !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setIosPickerField(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIosPickerField(null)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {iosPickerField === 'dateTimeFrom' ? 'Date & Time From' : 'Date & Time To'}
            </Text>
            <Pressable
              onPress={() => {
                if (!iosPickerField) return;
                onChange((p) => ({ ...p, [iosPickerField]: iosPickerValue.toISOString() } as any));
                setIosPickerField(null);
              }}
              style={styles.iosDoneBtn}
            >
              <Text style={styles.iosDoneText}>Done</Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={iosPickerValue}
            mode="datetime"
            display="spinner"
            onChange={(_, d) => {
              if (d) setIosPickerValue(d);
            }}
          />
        </View>
      </Modal>

      <SelectModal
        title="Select Project"
        visible={projectModal}
        onClose={() => setProjectModal(false)}
        items={[
          ...projects.map((p) => ({
            key: p.$id,
            label: `${p.name || 'Project'}${p.projectID ? ` (${p.projectID})` : ''}`,
            onPress: () => {
              onChange((prev) => ({ ...prev, projectId: p.$id, projectName: p.name || '' }));
              setCustomProjectName('');
              setProjectModal(false);
            },
          })),
          {
            key: 'other',
            label: 'Other',
            onPress: () => {
              onChange((prev) => ({ ...prev, projectId: 'N/A', projectName: '' }));
              setCustomProjectName('');
              setProjectModal(false);
            },
          },
        ]}
      />

      <SelectModal
        title="Select Level 1 Approver"
        visible={approverModal}
        onClose={() => setApproverModal(false)}
        items={approvers.map((a) => ({
          key: a.userId,
          label: `${a.name}${a.department ? ` (${a.department})` : ''}`,
          onPress: () => {
            onChange((p) => ({ ...p, l1ApproverId: a.userId }));
            setApproverModal(false);
          },
        }))}
      />

      <SelectModal
        title="Type of Travel"
        visible={travelTypeModal}
        onClose={() => setTravelTypeModal(false)}
        items={travelTypes.map((t) => ({
          key: t,
          label: t,
          onPress: () => {
            onChange((p) => ({ ...p, travelType: t }));
            setTravelTypeModal(false);
          },
        }))}
      />
    </View>
  );
}

function FundingExpensesStep({
  data,
  onChange,
}: {
  data: FormData;
  onChange: React.Dispatch<React.SetStateAction<FormData>>;
}) {
  const showBankDetails = data.paymentMethod === 'bank_transfer' && !data.hasBankDetailsOnFile;

  const addItem = () => {
    onChange((p) => ({
      ...p,
      expenseBreakdown: [
        ...(p.expenseBreakdown || []),
        { id: String(Date.now()), purpose: '', description: '', quantity: 1, unitCost: 0, subtotal: 0 },
      ],
    }));
  };
  const removeItem = (idx: number) => {
    onChange((p) => ({ ...p, expenseBreakdown: (p.expenseBreakdown || []).filter((_, i) => i !== idx) }));
  };
  const updateExpense = (idx: number, field: string, value: any) => {
    onChange((p) => {
      const next = [...(p.expenseBreakdown || [])];
      const item = { ...next[idx], [field]: value };
      const qty = Number(field === 'quantity' ? value : item.quantity) || 0;
      const unit = Number(field === 'unitCost' ? value : item.unitCost) || 0;
      item.subtotal = qty * unit;
      next[idx] = item;
      return { ...p, expenseBreakdown: next };
    });
  };

  const currencies = [
    { value: 'UGX', label: 'UGX - Ugandan Shilling' },
    { value: 'USD', label: 'USD - US Dollar' },
    { value: 'EUR', label: 'EUR - Euro' },
    { value: 'GBP', label: 'GBP - British Pound' },
  ];

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.stepCard}>
        <Text style={styles.stepTitle}>Funding, Expenses & Payment Method</Text>
        <Text style={styles.stepSub}>Please specify your funding requirements and preferred payment method.</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Overall Currency for Expenses *</Text>
        <View style={styles.chipWrap}>
          {currencies.map((c) => (
            <Chip
              key={c.value}
              label={c.value}
              active={data.currency === c.value}
              onPress={() => onChange((p) => ({ ...p, currency: c.value }))}
            />
          ))}
        </View>

        <View style={styles.expenseHeaderRow}>
          <Text style={styles.label}>Expense Breakdown *</Text>
          <Pressable onPress={addItem} style={styles.smallBtn}>
            <MaterialCommunityIcons name="plus" size={16} color="#054653" />
            <Text style={styles.smallBtnText}>Add Expense Item</Text>
          </Pressable>
        </View>

        {data.expenseBreakdown.length === 0 ? (
          <Text style={styles.muted}>No expense items added yet. Tap “Add Expense Item” to begin.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {data.expenseBreakdown.map((e, idx) => (
              <View key={e.id} style={styles.expenseCard}>
                <Field
                  label="Purpose/Description *"
                  value={e.purpose}
                  onChangeText={(v) => updateExpense(idx, 'purpose', v)}
                  placeholder="e.g., Hotel Night, Local travel"
                />
                <View style={styles.twoColRow}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Qty *"
                      value={String(e.quantity ?? '')}
                      onChangeText={(v) => updateExpense(idx, 'quantity', Number(v))}
                      keyboardType="numeric"
                      placeholder="1"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Unit Cost *"
                      value={String(e.unitCost ?? '')}
                      onChangeText={(v) => updateExpense(idx, 'unitCost', Number(v))}
                      keyboardType="numeric"
                      placeholder="0"
                    />
                  </View>
                </View>
                <RowLine label="Subtotal" value={`${data.currency || ''} ${(e.subtotal || 0).toLocaleString()}`} />
                <Pressable onPress={() => removeItem(idx)} style={styles.deleteBtn}>
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color="#b91c1c" />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              </View>
            ))}

            <View style={styles.totalPill}>
              <Text style={styles.totalPillLabel}>Total Amount Requested:</Text>
              <Text style={styles.totalPillValue}>
                {data.currency} {(data.totalAmount || 0).toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        <Text style={[styles.label, { marginTop: 12 }]}>Payment Method *</Text>
        <View style={styles.radioRow}>
          {(['cash', 'bank_transfer', 'mobile_money', 'cheque'] as const).map((m) => (
            <Radio
              key={m}
              label={paymentMethodNice(m)}
              active={data.paymentMethod === m}
              onPress={() => onChange((p) => ({ ...p, paymentMethod: m }))}
            />
          ))}
        </View>

        {data.paymentMethod === 'bank_transfer' ? (
          <View style={{ marginTop: 10, gap: 10 }}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>My bank details are already with the finance department</Text>
              <Switch
                value={!!data.hasBankDetailsOnFile}
                onValueChange={(v) =>
                  onChange((p) => ({ ...p, hasBankDetailsOnFile: v, bankDetails: v ? null : p.bankDetails }))
                }
                trackColor={{ true: '#054653', false: '#e5e7eb' }}
              />
            </View>
            {showBankDetails ? (
              <View style={styles.bankBox}>
                <Text style={styles.bankTitle}>Bank Details</Text>
                <Field
                  label="Account Number *"
                  value={data.bankDetails?.accountNumber || ''}
                  onChangeText={(v) =>
                    onChange((p) => ({
                      ...p,
                      bankDetails: { ...(p.bankDetails || {}), accountNumber: v } as any,
                    }))
                  }
                  placeholder="Enter your account number"
                />
                <Field
                  label="Bank Name *"
                  value={data.bankDetails?.bankName || ''}
                  onChangeText={(v) =>
                    onChange((p) => ({ ...p, bankDetails: { ...(p.bankDetails || {}), bankName: v } as any }))
                  }
                  placeholder="e.g., Stanbic Bank"
                />
                <Field
                  label="Branch *"
                  value={data.bankDetails?.branch || ''}
                  onChangeText={(v) =>
                    onChange((p) => ({ ...p, bankDetails: { ...(p.bankDetails || {}), branch: v } as any }))
                  }
                  placeholder="e.g., Kampala Main Branch"
                />
                <Field
                  label="SWIFT Code (Optional)"
                  value={data.bankDetails?.swiftCode || ''}
                  onChangeText={(v) =>
                    onChange((p) => ({ ...p, bankDetails: { ...(p.bankDetails || {}), swiftCode: v } as any }))
                  }
                  placeholder="e.g., SBICUGKX"
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {data.paymentMethod === 'mobile_money' ? (
          <Field
            label="Mobile Number *"
            value={data.mobileNumber}
            onChangeText={(v) => onChange((p) => ({ ...p, mobileNumber: v }))}
            placeholder="e.g., +256700000000"
            keyboardType="phone-pad"
          />
        ) : null}
      </View>
    </View>
  );
}

function AttachmentsStep({
  data,
  existingUploads,
  onRemoveExisting,
  onChange,
  onPickFiles,
  isEditMode,
}: {
  data: FormData;
  existingUploads: UploadedAttachment[];
  onRemoveExisting: (idx: number) => void;
  onChange: React.Dispatch<React.SetStateAction<FormData>>;
  onPickFiles: () => void;
  isEditMode: boolean;
}) {
  const remove = (id: string) => {
    onChange((p) => ({ ...p, attachments: (p.attachments || []).filter((a) => a.id !== id) }));
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.stepCard}>
        <Text style={styles.stepTitle}>Supporting Attachments & Comments</Text>
        <Text style={styles.stepSub}>Upload any supporting documents and provide additional comments.</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Upload Supporting Files (Optional)</Text>
        <Text style={styles.helper}>
          Maximum file size: 20MB. Supported formats: PDF, DOC, DOCX, JPG, JPEG, PNG.
        </Text>

        <Pressable onPress={onPickFiles} style={styles.uploadArea}>
          <MaterialCommunityIcons name="folder-upload-outline" size={26} color="#054653" />
          <Text style={styles.uploadTitle}>Tap to choose files</Text>
          <Text style={styles.uploadSub}>Tickets, hotel confirmations, and other supporting docs</Text>
        </Pressable>

        {isEditMode && existingUploads.length > 0 ? (
          <View style={{ marginTop: 12, gap: 10 }}>
            <Text style={styles.label}>Existing Attachments ({existingUploads.length})</Text>
            {existingUploads.map((f, idx) => (
              <View key={f.fileId || `${idx}`} style={styles.fileRow}>
                <MaterialCommunityIcons name={fileIcon(f.mimeType)} size={18} color="#054653" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {f.fileName}
                  </Text>
                  <Text style={styles.fileMeta}>
                    {formatFileSize(Number(f.fileSize || 0))} • {f.mimeType}
                  </Text>
                </View>
                <Pressable onPress={() => onRemoveExisting(idx)} style={styles.fileRemoveBtn}>
                  <MaterialCommunityIcons name="close" size={18} color="#b91c1c" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {data.attachments.length > 0 ? (
          <View style={{ marginTop: 12, gap: 10 }}>
            <Text style={styles.label}>
              {isEditMode ? `New Attachments (${data.attachments.length})` : `Uploaded Files (${data.attachments.length})`}
            </Text>
            {data.attachments.map((f) => (
              <View key={f.id} style={styles.fileRow}>
                <MaterialCommunityIcons name={fileIcon(f.mimeType)} size={18} color="#054653" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text style={styles.fileMeta}>
                    {formatFileSize(f.size)} • {f.mimeType}
                  </Text>
                </View>
                <Pressable onPress={() => remove(f.id)} style={styles.fileRemoveBtn}>
                  <MaterialCommunityIcons name="close" size={18} color="#b91c1c" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[styles.label, { marginTop: 12 }]}>Additional Comments/Notes (Optional)</Text>
        <TextInput
          value={data.comments}
          onChangeText={(v) => onChange((p) => ({ ...p, comments: v }))}
          placeholder="Provide any additional information or special requirements..."
          placeholderTextColor="#9ca3af"
          style={[styles.input, styles.textarea]}
          multiline
          numberOfLines={4}
        />
      </View>
    </View>
  );
}

function ReviewStep({ data }: { data: FormData }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.stepCard}>
        <Text style={styles.stepTitle}>Review Your Travel Request</Text>
        <Text style={styles.stepSub}>Please review all the information below before submitting.</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.sectionH}>Trip Details</Text>
        <RowLine label="Payment Type" value={data.paymentType ? (data.paymentType === 'advance' ? 'Advance' : 'Reimbursement') : '—'} />
        <RowLine label="Activity Name" value={data.activityName || '—'} />
        <RowLine label="Project Name" value={data.projectName || '—'} />
        <RowLine label="Project ID" value={data.projectId || '—'} />
        <RowLine label="L1 Approver ID" value={data.l1ApproverId || '—'} />
        <RowLine label="Travel Type" value={data.travelType || '—'} />
        <RowLine label="Origin" value={data.origin || '—'} />
        <RowLine label="Destination" value={data.destination || '—'} />
        <RowLine label="From Date/Time" value={data.dateTimeFrom ? new Date(data.dateTimeFrom).toLocaleString() : '—'} />
        <RowLine label="To Date/Time" value={data.dateTimeTo ? new Date(data.dateTimeTo).toLocaleString() : '—'} />

        <Text style={[styles.sectionH, { marginTop: 14 }]}>Expense Breakdown</Text>
        <RowLine label="Currency" value={data.currency || '—'} />
        <RowLine
          label="Total Amount"
          value={data.currency ? `${data.currency} ${(data.totalAmount || 0).toLocaleString()}` : String(data.totalAmount || 0)}
        />

        <Text style={[styles.sectionH, { marginTop: 14 }]}>Payment Information</Text>
        <RowLine label="Payment Method" value={data.paymentMethod ? paymentMethodNice(data.paymentMethod) : '—'} />
        {data.paymentMethod === 'bank_transfer' ? (
          <RowLine
            label="Bank Details"
            value={data.hasBankDetailsOnFile ? 'On file with finance department' : data.bankDetails ? 'Provided' : '—'}
          />
        ) : null}
        {data.paymentMethod === 'mobile_money' ? (
          <RowLine label="Mobile Number" value={data.mobileNumber || '—'} />
        ) : null}

        {data.attachments.length > 0 ? (
          <>
            <Text style={[styles.sectionH, { marginTop: 14 }]}>Attachments</Text>
            {data.attachments.map((a, idx) => (
              <RowLine key={a.id} label={`File ${idx + 1}`} value={`${a.name} (${formatFileSize(a.size)})`} />
            ))}
          </>
        ) : null}

        {data.comments ? (
          <>
            <Text style={[styles.sectionH, { marginTop: 14 }]}>Additional Comments</Text>
            <Text style={styles.comment}>{data.comments}</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        style={styles.input}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function RowLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowLine}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Radio({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.radio, active && styles.radioActive]}>
      <View style={[styles.radioDot, active && styles.radioDotActive]} />
      <Text style={[styles.radioText, active && styles.radioTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SelectModal({
  title,
  visible,
  onClose,
  items,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  items: Array<{ key: string; label: string; onPress: () => void }>;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Header (~52) + sheet padding; keep list clear of bottom gesture/home area.
  const sheetVerticalPadding = 12 * 2;
  const headerApprox = 48;
  const bottomReserve = Math.max(insets.bottom, 12) + 16;
  const maxListHeight = Math.max(
    220,
    Math.min(440, Math.round(windowHeight * 0.55) - headerApprox - sheetVerticalPadding - bottomReserve),
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.selectModalRoot}>
        <Pressable style={styles.modalBackdropFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <View
          style={[
            styles.modalSheet,
            {
              paddingBottom: bottomReserve,
              maxHeight: Math.round(windowHeight * 0.92),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} style={styles.modalCloseBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
            </Pressable>
          </View>
          <ScrollView
            style={{ maxHeight: maxListHeight }}
            contentContainerStyle={styles.selectModalListContent}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {items.map((it) => (
              <Pressable
                key={it.key}
                onPress={it.onPress}
                style={({ pressed }) => [styles.modalItem, pressed && styles.modalItemPressed]}
              >
                <Text style={styles.modalItemText}>{it.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function validateStep(step: number, data: FormData): string | null {
  if (step >= 1) {
    if (!data.paymentType) return 'Payment type is required';
    if (!data.activityName.trim()) return 'Activity name is required';
    if (!data.projectName.trim()) return 'Project name is required';
    if (!data.projectId.trim()) return 'Project ID is required';
    if (!data.l1ApproverId) return 'Level 1 approver selection is required';
    if (!data.travelType) return 'Travel type is required';
    if (!data.origin.trim()) return 'Origin is required';
    if (!data.destination.trim()) return 'Destination is required';
    if (!data.dateTimeFrom) return 'Start date and time is required';
    if (!data.dateTimeTo) return 'End date and time is required';

    const fromDate = new Date(data.dateTimeFrom);
    const toDate = new Date(data.dateTimeTo);
    const now = new Date();
    if (data.paymentType === 'advance' && fromDate < now) return 'Start date cannot be in the past for advance payment';
    if (data.paymentType === 'reimbursement' && fromDate > now)
      return 'Start date cannot be in the future for reimbursement';
    if (toDate <= fromDate) return 'End date must be after start date';
  }
  if (step >= 2) {
    if (!data.currency) return 'Currency is required';
    if (!data.expenseBreakdown || data.expenseBreakdown.length === 0) return 'At least one expense item is required';
    for (const e of data.expenseBreakdown) {
      if (!e.purpose.trim()) return 'Each expense item must have a purpose/description';
      if (!e.quantity || e.quantity <= 0) return 'Expense quantity must be greater than 0';
      if (!e.unitCost || e.unitCost <= 0) return 'Expense unit cost must be greater than 0';
    }
    if (!data.paymentMethod) return 'Payment method is required';
    if (data.paymentMethod === 'bank_transfer' && !data.hasBankDetailsOnFile) {
      if (!data.bankDetails?.accountNumber?.trim()) return 'Account number is required';
      if (!data.bankDetails?.bankName?.trim()) return 'Bank name is required';
      if (!data.bankDetails?.branch?.trim()) return 'Branch is required';
    }
    if (data.paymentMethod === 'mobile_money' && !data.mobileNumber.trim())
      return 'Mobile number is required for mobile money payments';
  }
  return null;
}

function projectLabel(
  projects: Array<{ $id: string; name?: string | null; projectID?: string | null }>,
  projectId: string,
  projectName: string,
) {
  if (projectId === 'N/A') return projectName ? `Other: ${projectName}` : 'Other';
  const p = projects.find((x) => x.$id === projectId);
  return p ? `${p.name || 'Project'}${p.projectID ? ` (${p.projectID})` : ''}` : projectName || projectId;
}

function approverLabel(list: Array<{ userId: string; name: string; department?: string | null }>, id: string) {
  const a = list.find((x) => x.userId === id);
  return a ? `${a.name}${a.department ? ` (${a.department})` : ''}` : id;
}

function paymentMethodNice(m: string) {
  if (m === 'cash') return 'Cash';
  if (m === 'bank_transfer') return 'Bank Transfer';
  if (m === 'mobile_money') return 'Mobile Money';
  if (m === 'cheque') return 'Cheque';
  return m;
}

function formatFileSize(bytes: number) {
  if (!bytes || bytes <= 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  const v = bytes / Math.pow(k, i);
  return `${v.toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
}

function fileIcon(mimeType: string) {
  const m = (mimeType || '').toLowerCase();
  if (m.includes('pdf')) return 'file-pdf-box';
  if (m.includes('word') || m.includes('document')) return 'file-word-box';
  if (m.includes('image')) return 'file-image';
  return 'paperclip';
}

function guessMimeFromName(name: string) {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.doc')) return 'application/msword';
  if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function formatDateTime12(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Force 12-hour display with AM/PM to match the web UX.
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 140 },

  // Brand colors
  // Primary (HR): deep teal
  // Accent (NREP): gold/orange
  // Keep text in teal for contrast on gold.
  //
  // NOTE: keeping as literals here to avoid adding a theme system refactor.

  headerCard: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 5,
  },
  headerTitle: { color: '#054653', fontSize: 18, fontWeight: '900' },
  headerSub: { marginTop: 4, color: '#6b7280', fontSize: 12, fontWeight: '600' },
  progressOuter: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#eef2f2',
    overflow: 'hidden',
    marginTop: 10,
  },
  progressInner: { height: 8, backgroundColor: '#FFB803', borderRadius: 999 },
  progressText: { marginTop: 8, color: '#6b7280', fontSize: 12, fontWeight: '700' },
  stepDotsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  stepDotActive: { backgroundColor: '#fff7ed', borderColor: '#FFB803' },
  stepDotDone: { backgroundColor: '#FFB803', borderColor: '#FFB803' },
  stepDotText: { color: '#6b7280', fontWeight: '900', fontSize: 12 },
  stepDotTextActive: { color: '#054653' },
  stepDotTextDone: { color: '#ffffff' },

  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },
  warningBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFB803',
    backgroundColor: '#fff7ed',
    padding: 12,
    marginBottom: 12,
  },
  warningTitle: { color: '#054653', fontSize: 12, fontWeight: '900' },
  warningText: { marginTop: 4, color: '#6b7280', fontSize: 12, fontWeight: '600' },
  loadingBox: { paddingVertical: 24, alignItems: 'center' },

  stepCard: { marginBottom: 0 },
  stepTitle: { color: '#054653', fontSize: 15, fontWeight: '900' },
  stepSub: { marginTop: 4, color: '#6b7280', fontSize: 12, fontWeight: '600' },

  formCard: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  label: { color: '#111827', fontSize: 12, fontWeight: '800', marginTop: 10 },
  helper: { marginTop: 6, color: '#6b7280', fontSize: 12, fontWeight: '600' },
  input: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
  },
  textarea: { minHeight: 110, textAlignVertical: 'top' as any },
  selectBtn: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectBtnText: { flex: 1, color: '#111827', fontSize: 13, fontWeight: '700' },

  twoColRow: { flexDirection: 'row', gap: 10 },
  radioRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  radio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  radioActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#9ca3af',
  },
  radioDotActive: { borderColor: '#054653', backgroundColor: '#054653' },
  radioText: { color: '#6b7280', fontSize: 12, fontWeight: '800' },
  radioTextActive: { color: '#054653' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  chipActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  chipText: { color: '#6b7280', fontSize: 12, fontWeight: '900' },
  chipTextActive: { color: '#054653' },

  expenseHeaderRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFB803',
    borderWidth: 1,
    borderColor: '#FFB803',
  },
  smallBtnText: { color: '#054653', fontWeight: '900', fontSize: 12 },
  muted: { marginTop: 8, color: '#6b7280', fontSize: 12, fontWeight: '600' },
  expenseCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  rowLine: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rowLabel: { color: '#6b7280', fontSize: 11, fontWeight: '800' },
  rowValue: { marginTop: 2, color: '#111827', fontSize: 13, fontWeight: '700' },
  deleteBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  deleteBtnText: { color: '#b91c1c', fontWeight: '900', fontSize: 12 },
  totalPill: {
    marginTop: 2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalPillLabel: { color: '#6b7280', fontSize: 12, fontWeight: '800' },
  totalPillValue: { color: '#054653', fontSize: 13, fontWeight: '900' },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  switchLabel: { flex: 1, color: '#111827', fontSize: 12, fontWeight: '800' },
  bankBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  bankTitle: { color: '#054653', fontWeight: '900', fontSize: 13 },

  uploadArea: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFB803',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  uploadTitle: { color: '#054653', fontSize: 13, fontWeight: '900' },
  uploadSub: { color: '#6b7280', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fileName: { color: '#111827', fontSize: 12, fontWeight: '800' },
  fileMeta: { marginTop: 2, color: '#6b7280', fontSize: 11, fontWeight: '600' },
  fileRemoveBtn: { padding: 6 },

  sectionH: { color: '#054653', fontSize: 13, fontWeight: '900', marginTop: 2 },
  comment: { marginTop: 8, color: '#111827', fontSize: 13, fontWeight: '600' },

  navRow: { flexDirection: 'row', gap: 12, marginTop: 14, marginBottom: 10 },
  navBtn: {
    borderRadius: 12,
    backgroundColor: '#FFB803',
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnOutline: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  navBtnText: { color: '#054653', fontSize: 12, fontWeight: '900' },
  navBtnTextOutline: { color: '#054653' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  /** Full-screen wrapper so the sheet sits above status/gesture areas consistently. */
  selectModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalBackdropFill: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingTop: 12,
    zIndex: 2,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  selectModalListContent: {
    paddingBottom: 8,
    flexGrow: 0,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  modalTitle: { color: '#054653', fontSize: 14, fontWeight: '900' },
  modalCloseBtn: { padding: 8 },
  modalItem: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
  },
  modalItemPressed: { backgroundColor: '#f3f4f6' },
  modalItemText: { color: '#111827', fontSize: 13, fontWeight: '700' },

  iosDoneBtn: {
    borderRadius: 12,
    backgroundColor: '#FFB803',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iosDoneText: { color: '#054653', fontWeight: '900', fontSize: 12 },

  submittedBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  submittedCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  submittedIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FFB803',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  submittedTitle: {
    marginTop: 10,
    color: '#054653',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  submittedSub: {
    marginTop: 6,
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  submittedIdPill: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFB803',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  submittedIdLabel: { color: '#6b7280', fontSize: 11, fontWeight: '800' },
  submittedIdValue: { marginTop: 4, color: '#054653', fontSize: 16, fontWeight: '900' },
  submittedActions: { marginTop: 14, gap: 10 },
  submittedBtn: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submittedBtnPrimary: {
    backgroundColor: '#054653',
  },
  submittedBtnTextPrimary: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  submittedBtnGradient: { backgroundColor: 'transparent', overflow: 'hidden' },
  submittedBtnGradientInner: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submittedBtnOutline: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  submittedBtnTextOutline: { color: '#054653', fontSize: 12, fontWeight: '900' },
});

