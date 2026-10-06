import {useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {toast} from 'sonner';
import {Breadcrumb,FormError,Modal,PageTitle,NONE,useSubmit} from '@/components/common';
import {AddressFields,AddressText,addressFrom} from '@/components/address-fields';
import {OrderCard} from './orders';
import {AuthPage} from './auth';
import {useApp} from '@/lib/store';
import {api} from '@/lib/api';
import {cn} from '@/lib/utils';
import type {Address} from '@/lib/types';
const TABS=[['overview','Overview'],['profile','Your details'],['addresses','Address book']] as const;
export function Account(){
 const user=useApp(s=>s.user),[params]=useSearchParams(),navigate=useNavigate(),perform=useApp(s=>s.perform);
 if(!user||user.guest)return<AuthPage/>;
 const tab=params.get('tab')??'overview';
 const logout=async()=>{try{await perform('/auth/logout')}catch{return}useApp.getState().clearDraft();await useApp.getState().init();navigate('/account');toast('You’re signed out.')};
 return<div className="page-wrap"><Breadcrumb parts={[{label:'Your account'}]}/><PageTitle title="Your FORMA."/><div className="account-layout"><nav className="account-nav" aria-label="Account navigation">{TABS.map(([v,l])=><Link key={v} className={cn(tab===v&&'active')} to={'/account?tab='+v}>{l}</Link>)}<Link to="/orders">Orders</Link><Link to="/wishlist">Saved frames</Link><button type="button" onClick={logout}>Sign out</button></nav>
  <div className="account-content">{tab==='addresses'?<Addresses/>:tab==='profile'?<Details/>:<Overview/>}</div></div></div>
}
function Overview(){
 const user=useApp(s=>s.user)!,orders=useApp(s=>s.orders??NONE),wishlist=useApp(s=>s.wishlist??NONE),addresses=useApp(s=>s.addresses??NONE);
 return<><h2>Good to see you, {user.firstName}.</h2><p>Your everyday essentials, all in one place.</p><div className="account-overview"><Link className="account-stat" to="/orders"><strong>{orders.length}</strong><span>Orders</span></Link><Link className="account-stat" to="/wishlist"><strong>{wishlist.length}</strong><span>Saved frames</span></Link><Link className="account-stat" to="/account?tab=addresses"><strong>{addresses.length}</strong><span>Addresses</span></Link></div><h3 style={{marginBottom:23}}>Your latest order</h3>{orders[0]?<OrderCard o={orders[0]}/>:<p className="muted">Your first order will appear here.</p>}</>
}
function Details(){
 const user=useApp(s=>s.user)!,perform=useApp(s=>s.perform),details=useSubmit(),password=useSubmit();
 return<><h2>A little about you.</h2><form onSubmit={details.submit(async f=>{await perform('/user','PATCH',{firstName:f.firstName,lastName:f.lastName,email:f.email,currentPassword:f.currentPassword||undefined},{silent:true});toast('Your details are updated.')})}><div className="form-grid"><div className="field"><label htmlFor="profile-first">First name</label><input id="profile-first" name="firstName" defaultValue={user.firstName} maxLength={50} autoComplete="given-name" required/></div><div className="field"><label htmlFor="profile-last">Last name</label><input id="profile-last" name="lastName" defaultValue={user.lastName} maxLength={50} autoComplete="family-name" required/></div><div className="field full"><label htmlFor="profile-email">Email address</label><input id="profile-email" name="email" type="email" defaultValue={user.email} maxLength={120} autoComplete="email" required/></div><div className="field full"><label htmlFor="profile-current">Current password (only needed to change your email)</label><input id="profile-current" name="currentPassword" type="password" autoComplete="current-password" maxLength={128}/></div></div><FormError message={details.error}/><button className="button" disabled={details.busy} style={{marginTop:25}}>Save details</button></form>
  <h2 style={{margin:'40px 0 22px',fontSize:'1.7rem'}}>Change your password.</h2><form onSubmit={password.submit(async(f,form)=>{await api('/security/password','POST',{currentPassword:f.oldPassword,password:f.newPassword});form.reset();toast('Password updated. Other sessions were signed out.')})}><div className="form-grid"><div className="field full"><label htmlFor="old-password">Current password</label><input id="old-password" name="oldPassword" type="password" autoComplete="current-password" required/></div><div className="field full"><label htmlFor="new-password">New password</label><input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required/></div></div><FormError message={password.error}/><button className="button outline" disabled={password.busy} style={{marginTop:25}}>Update password</button></form></>
}
function Addresses(){
 const addresses=useApp(s=>s.addresses??NONE),perform=useApp(s=>s.perform),busy=useApp(s=>s.busy)>0;
 const[editing,setEditing]=useState<Address|'new'|null>(null),[removing,setRemoving]=useState<string|null>(null),{error,submit}=useSubmit();
 const current=editing&&editing!=='new'?editing:undefined;
 return<><h2>Your address book.</h2><p>A little less typing next time.</p><div className="address-grid">{addresses.map(a=><div key={a.id} className="address-card"><h3>{a.isDefault?'Default address':'Delivery address'}</h3><p><AddressText a={a}/></p><div className="address-actions"><button type="button" className="text-button small" onClick={()=>setEditing(a)}>Edit</button><button type="button" className="text-button small" onClick={()=>setRemoving(a.id)}>Delete</button>{!a.isDefault&&<button type="button" className="text-button small" disabled={busy} onClick={()=>perform('/addresses/'+a.id,'PATCH',{isDefault:true}).then(()=>toast('Default address updated.'),()=>{})}>Set default</button>}</div></div>)}</div>
  <button type="button" className="button outline" style={{marginTop:25}} onClick={()=>setEditing('new')}>Add an address</button>
  <Modal open={!!editing} onOpenChange={o=>{if(!o)setEditing(null)}} title={current?'Edit your address.':'A new destination.'}><form onSubmit={submit(async f=>{const body={...addressFrom(f),isDefault:!!f.isDefault};await perform(current?'/addresses/'+current.id:'/addresses',current?'PATCH':'POST',body,{silent:true});setEditing(null);toast('Address saved.')})}><div className="modal-body"><AddressFields address={current}/><label className="check-label" style={{marginTop:20}}><input type="checkbox" name="isDefault" defaultChecked={current?.isDefault}/> Make this my default address</label><FormError message={error}/></div><div className="modal-footer"><button className="button">Save address</button></div></form></Modal>
  <Modal open={!!removing} onOpenChange={o=>{if(!o)setRemoving(null)}} title="Remove this address?"><div className="modal-body"><p>You can add it again whenever you need it.</p></div><div className="modal-footer"><button type="button" className="button outline" onClick={()=>setRemoving(null)}>Keep address</button><button type="button" className="button" disabled={busy} onClick={()=>perform('/addresses/'+removing,'DELETE').then(()=>{setRemoving(null);toast('Address removed.')},()=>{})}>Remove address</button></div></Modal></>
}
