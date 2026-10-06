import React, { useCallback, useEffect, useState } from "react";
import { addStoreMember, listStoreMembers, removeStoreMember, updateStoreMember } from "../data/storeService.js";
import "./TeamManager.css";

const MEMBER_ROLES = [
	["admin", "Administrador"],
	["manager", "Gerente"],
	["staff", "Personal"],
	["support", "Soporte"],
	["viewer", "Solo lectura"],
];

export function TeamManager({ store }) {
	const [members, setMembers] = useState([]);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState("staff");
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const isOwner = store.role === "owner";
	const availableRoles = isOwner ? MEMBER_ROLES : MEMBER_ROLES.filter(([value]) => value !== "admin");
	const refresh = useCallback(async () => {
		setMembers(await listStoreMembers(store.id));
	}, [store.id]);

	useEffect(() => {
		refresh().catch(error => setMessage(error.message));
	}, [refresh]);

	const addMember = async event => {
		event.preventDefault();
		setBusy(true);
		setMessage("");
		try {
			await addStoreMember(store.id, { email, role });
			setEmail("");
			await refresh();
			setMessage("Miembro añadido a la tienda");
		} catch (error) {
			setMessage(error.message);
		} finally {
			setBusy(false);
		}
	};

	const changeRole = async (member, nextRole) => {
		setBusy(true);
		setMessage("");
		try {
			await updateStoreMember(store.id, member.id, nextRole);
			await refresh();
			setMessage("Rol actualizado");
		} catch (error) {
			setMessage(error.message);
			try {
				await refresh();
			} catch (refreshError) {
				setMessage(`${error.message} · ${refreshError.message}`);
			}
		} finally {
			setBusy(false);
		}
	};

	const removeMember = async member => {
		if (!window.confirm(`¿Quitar a ${member.email} de esta tienda?`)) return;
		setBusy(true);
		setMessage("");
		try {
			await removeStoreMember(store.id, member.id);
			await refresh();
			setMessage("Miembro eliminado de la tienda");
		} catch (error) {
			setMessage(error.message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<header>
				<div><small>BRAVOSHOP ADMIN</small><h1>Equipo</h1></div>
			</header>
			<article className="panel formStack">
				<h3>Añadir a una persona</h3>
				<p>Solo puedes añadir cuentas BravoShop existentes. La persona tendrá acceso según el rol asignado.</p>
				<form className="teamInviteForm" onSubmit={addMember}>
					<label>Email de la cuenta<input type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
					<label>Rol<select value={role} onChange={event => setRole(event.target.value)}>{availableRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
					<button type="submit" disabled={busy}>{busy ? "Guardando…" : "Añadir miembro"}</button>
				</form>
			</article>
			<article className="panel teamPanel">
				<h3>Miembros de la tienda</h3>
				{members.length ? <div className="teamMemberList">{members.map(member => {
					const protectedMember = member.role === "owner" || (!isOwner && member.role === "admin");
					return (
						<div className="teamMember" key={member.id}>
							<div><b>{member.name || member.email}</b><small>{member.email}</small></div>
							{protectedMember
								? <span className="teamRole">{member.role === "owner" ? "Propietario" : "Administrador"}</span>
								: <div className="teamMemberActions">
									<select aria-label={`Rol de ${member.email}`} disabled={busy} value={member.role} onChange={event => changeRole(member, event.target.value)}>
										{availableRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
									</select>
									<button className="ghost" type="button" disabled={busy} onClick={() => removeMember(member)}>Quitar</button>
								</div>}
						</div>
					);
				})}</div> : <div className="empty">No hay miembros activos todavía.</div>}
				{message && <p role="status">{message}</p>}
			</article>
		</>
	);
}
