<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Property;
use App\Models\Soum;
use Illuminate\Http\Request;

/**
 * السوم — the bids recorded against a property.
 *
 * Bids are only ever listed from inside one property, so there is no global
 * index; store hangs off the property and update/destroy address the bid
 * directly. Deletion is real (the whole app dropped soft deletes).
 */
class SoumController extends Controller
{
    /**
     * The form always submits every field, so both store and update validate
     * the same way. The broker pair is required_if rather than nullable: a
     * غير مباشر bid without its broker is the one shape the screen must not
     * be able to save.
     */
    private function rules(): array
    {
        return [
            'bidder_name'  => 'required|string|max:255',
            'soum_date'    => 'required|date',
            'amount'       => 'required|numeric|min:0',
            'soum_type'    => 'required|in:مباشر,غير مباشر',
            'broker_name'  => 'required_if:soum_type,غير مباشر|nullable|string|max:255',
            'broker_phone' => 'required_if:soum_type,غير مباشر|nullable|string|max:20',
        ];
    }

    private function messages(): array
    {
        return [
            'bidder_name.required'  => 'اسم السوام مطلوب.',
            'soum_date.required'    => 'التاريخ مطلوب.',
            'amount.required'       => 'مبلغ السوم مطلوب.',
            'soum_type.required'    => 'نوع السوم مطلوب.',
            'broker_name.required_if'  => 'اسم الوسيط مطلوب للسوم غير المباشر.',
            'broker_phone.required_if' => 'رقم هاتف الوسيط مطلوب للسوم غير المباشر.',
        ];
    }

    /** Broker data belongs to غير مباشر only — drop it for any other type. */
    private function clearBrokerForDirect(array $data): array
    {
        if ($data['soum_type'] !== Soum::TYPE_INDIRECT) {
            $data['broker_name']  = null;
            $data['broker_phone'] = null;
        }

        return $data;
    }

    /** GET /api/properties/{property}/soums — newest bid first. */
    public function index(Property $property)
    {
        return response()->json(
            $property->soums()->with('creator:id,name')->orderByDesc('soum_date')->orderByDesc('id')->get()
        );
    }

    /** POST /api/properties/{property}/soums */
    public function store(Request $request, Property $property)
    {
        $data = $this->clearBrokerForDirect(
            $request->validate($this->rules(), $this->messages())
        );

        $data['property_id'] = $property->id;
        $data['created_by'] = $request->user()->id;

        return response()->json(Soum::create($data), 201);
    }

    /** PUT /api/soums/{soum} */
    public function update(Request $request, Soum $soum)
    {
        $data = $this->clearBrokerForDirect(
            $request->validate($this->rules(), $this->messages())
        );

        $soum->update($data);

        return response()->json($soum->fresh());
    }

    /** DELETE /api/soums/{soum} */
    public function destroy(Soum $soum)
    {
        $soum->delete();

        return response()->json(['message' => 'تم حذف السوم.']);
    }
}
